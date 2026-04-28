package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"catreader/backend/internal/feedintro"
	"catreader/backend/internal/rss"
	"catreader/backend/internal/store"
)

type Server struct {
	store          *store.Store
	refresher      *rss.Refresher
	introGenerator *feedintro.Generator
}

func NewServer(store *store.Store, refresher *rss.Refresher, introGenerator *feedintro.Generator) *Server {
	return &Server{store: store, refresher: refresher, introGenerator: introGenerator}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	// 管理接口只触发后台任务或保存本地配置，不在请求生命周期内执行长任务。
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/stats", s.handleStats)
	mux.HandleFunc("GET /api/feeds", s.handleFeeds)
	mux.HandleFunc("GET /api/articles", s.handleArticles)
	mux.HandleFunc("GET /api/articles/", s.handleArticle)
	mux.HandleFunc("POST /api/admin/refresh", s.handleRefresh)
	mux.HandleFunc("POST /api/admin/feed-intros/refresh", s.handleFeedIntroRefresh)
	mux.HandleFunc("POST /api/admin/llm-config", s.handleLLMConfig)
	return withCORS(mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now().UTC()})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.Stats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleFeeds(w http.ResponseWriter, r *http.Request) {
	feeds, err := s.store.ListFeeds(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	type category struct {
		Category string       `json:"category"`
		Feeds    []store.Feed `json:"feeds"`
	}
	byCategory := []category{}
	index := map[string]int{}
	for _, feed := range feeds {
		// 保留数据库排序结果，同时把订阅源按分类聚合成前端需要的结构。
		i, ok := index[feed.Category]
		if !ok {
			i = len(byCategory)
			index[feed.Category] = i
			byCategory = append(byCategory, category{Category: feed.Category})
		}
		byCategory[i].Feeds = append(byCategory[i].Feeds, feed)
	}
	writeJSON(w, http.StatusOK, map[string]any{"categories": byCategory})
}

func (s *Server) handleArticles(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := store.ArticleQuery{
		FeedURL:  q.Get("feed_url"),
		Category: q.Get("category"),
		Search:   q.Get("q"),
		Limit:    intParam(q.Get("limit"), 50),
		Offset:   intParam(q.Get("offset"), 0),
	}
	articles, err := s.store.ListArticles(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  articles,
		"limit":  query.Limit,
		"offset": query.Offset,
	})
}

func (s *Server) handleArticle(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/articles/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, http.StatusBadRequest, errors.New("invalid article id"))
		return
	}
	article, err := s.store.GetArticle(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, errors.New("article not found"))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, article)
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	// 请求返回后仍继续刷新；刷新器内部会阻止并发重复执行。
	ctx := context.WithoutCancel(r.Context())
	go s.refresher.RefreshAll(ctx)
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "status": "refresh started"})
}

func (s *Server) handleFeedIntroRefresh(w http.ResponseWriter, r *http.Request) {
	if s.introGenerator == nil || !s.introGenerator.Enabled() {
		writeError(w, http.StatusServiceUnavailable, errors.New("feed intro generator is not configured"))
		return
	}
	ctx := context.WithoutCancel(r.Context())
	go s.introGenerator.RefreshDue(ctx)
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "status": "feed intro refresh started"})
}

type llmConfigRequest struct {
	BaseURL     string `json:"baseUrl"`
	APIKey      string `json:"apiKey"`
	Model       string `json:"model"`
	ContextSize int    `json:"contextSize"`
}

func (s *Server) handleLLMConfig(w http.ResponseWriter, r *http.Request) {
	// 保存 API Key 只允许本机调用，避免局域网内其他页面修改本地配置文件。
	if !isLoopbackRequest(r) {
		writeError(w, http.StatusForbidden, errors.New("admin config can only be changed from localhost"))
		return
	}

	var req llmConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	req.BaseURL = strings.TrimSpace(strings.TrimRight(req.BaseURL, "/"))
	req.APIKey = strings.TrimSpace(req.APIKey)
	req.Model = strings.TrimSpace(req.Model)
	req.ContextSize = normalizeContextSize(req.ContextSize)
	if req.BaseURL == "" || req.APIKey == "" || req.Model == "" {
		writeError(w, http.StatusBadRequest, errors.New("baseUrl, apiKey, and model are required"))
		return
	}

	if err := writeLocalLLMEnvFiles(req); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if s.introGenerator != nil {
		s.introGenerator.SetLLMConfig(req.BaseURL, req.APIKey, req.Model)
		ctx := context.WithoutCancel(r.Context())
		go s.introGenerator.RefreshDue(ctx)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"status":      "LLM config saved",
		"contextSize": req.ContextSize,
	})
}

func normalizeContextSize(value int) int {
	// 上下文文章数只影响前端 Ask Cat，限制范围可避免一次请求带入过多正文。
	if value < 5 {
		return 30
	}
	if value > 200 {
		return 200
	}
	return value
}

func isLoopbackRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func intParam(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{"error": err.Error()})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
