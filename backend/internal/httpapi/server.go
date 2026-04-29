package httpapi

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"catreader/backend/internal/feedintro"
	"catreader/backend/internal/rss"
	"catreader/backend/internal/store"
	"catreader/backend/internal/userstate"
)

type Server struct {
	store          *store.Store
	refresher      *rss.Refresher
	introGenerator *feedintro.Generator
	userState      *userstate.Store
}

func NewServer(store *store.Store, refresher *rss.Refresher, introGenerator *feedintro.Generator, userState *userstate.Store) *Server {
	return &Server{store: store, refresher: refresher, introGenerator: introGenerator, userState: userState}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	// 管理接口只触发后台任务或保存本地配置，不在请求生命周期内执行长任务。
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/stats", s.handleStats)
	mux.HandleFunc("GET /api/feeds", s.handleFeeds)
	mux.HandleFunc("GET /api/articles", s.handleArticles)
	mux.HandleFunc("GET /api/articles/", s.handleArticle)
	mux.HandleFunc("GET /api/user-state", s.handleGetUserState)
	mux.HandleFunc("POST /api/user-state", s.handlePostUserState)
	mux.HandleFunc("POST /api/admin/refresh", s.handleRefresh)
	mux.HandleFunc("POST /api/admin/feed-intros/refresh", s.handleFeedIntroRefresh)
	mux.HandleFunc("GET /api/admin/llm-config", s.handleGetLLMConfig)
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
		Sort:     q.Get("sort"),
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

func (s *Server) handleGetUserState(w http.ResponseWriter, r *http.Request) {
	if s.userState == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("user state database is not configured"))
		return
	}
	syncID, err := syncIDFromRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	start := time.Now()
	state, err := s.userState.GetState(r.Context(), syncID)
	if err != nil {
		log.Printf("user-state GET failed sync_id_hash=%s duration=%s error=%v", shortSyncIDHash(syncID), time.Since(start), err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	log.Printf("user-state GET sync_id_hash=%s duration=%s read_status=%d reading_list=%d read_positions=%d audio_positions=%d",
		shortSyncIDHash(syncID),
		time.Since(start),
		len(state.ReadStatus),
		len(state.ReadingList),
		len(state.ReadPositions),
		len(state.AudioPositions),
	)
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handlePostUserState(w http.ResponseWriter, r *http.Request) {
	if s.userState == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("user state database is not configured"))
		return
	}
	syncID, err := syncIDFromRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var state userstate.State
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&state); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	start := time.Now()
	if err := s.userState.SaveState(r.Context(), syncID, state); err != nil {
		log.Printf("user-state POST failed sync_id_hash=%s duration=%s read_status=%d reading_list=%d read_positions=%d audio_positions=%d error=%v",
			shortSyncIDHash(syncID),
			time.Since(start),
			len(state.ReadStatus),
			len(state.ReadingList),
			len(state.ReadPositions),
			len(state.AudioPositions),
			err,
		)
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	merged, err := s.userState.GetState(r.Context(), syncID)
	if err != nil {
		log.Printf("user-state POST reload failed sync_id_hash=%s duration=%s error=%v", shortSyncIDHash(syncID), time.Since(start), err)
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	log.Printf("user-state POST sync_id_hash=%s duration=%s request_read_status=%d request_reading_list=%d request_read_positions=%d request_audio_positions=%d merged_read_status=%d merged_reading_list=%d",
		shortSyncIDHash(syncID),
		time.Since(start),
		len(state.ReadStatus),
		len(state.ReadingList),
		len(state.ReadPositions),
		len(state.AudioPositions),
		len(merged.ReadStatus),
		len(merged.ReadingList),
	)
	writeJSON(w, http.StatusOK, merged)
}

type refreshRequest struct {
	FeedURL  string `json:"feedUrl"`
	Category string `json:"category"`
	Wait     bool   `json:"wait"`
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	ctx := context.WithoutCancel(r.Context())

	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	req.FeedURL = strings.TrimSpace(req.FeedURL)
	req.Category = strings.TrimSpace(req.Category)

	// 无 body 的旧调用保持原行为:触发全量后台刷新后立即返回。
	if !req.Wait && req.FeedURL == "" && req.Category == "" {
		go s.refresher.RefreshAll(ctx)
		writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "status": "refresh started"})
		return
	}

	feeds, err := s.refreshTargets(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(feeds) == 0 {
		writeError(w, http.StatusNotFound, errors.New("no matching feeds to refresh"))
		return
	}

	result := s.refresher.RefreshSelected(ctx, feeds)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":     true,
		"status": "refresh completed",
		"result": result,
	})
}

func (s *Server) refreshTargets(ctx context.Context, req refreshRequest) ([]store.Feed, error) {
	if req.FeedURL != "" && req.Category != "" {
		return nil, errors.New("feedUrl and category cannot both be set")
	}
	if req.FeedURL != "" {
		return []store.Feed{{URL: req.FeedURL}}, nil
	}

	feeds, err := s.store.ListFeeds(ctx)
	if err != nil {
		return nil, err
	}
	if req.Category == "" {
		return feeds, nil
	}

	targets := make([]store.Feed, 0)
	for _, feed := range feeds {
		if feed.Category == req.Category {
			targets = append(targets, feed)
		}
	}
	return targets, nil
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

func (s *Server) handleGetLLMConfig(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		writeError(w, http.StatusForbidden, errors.New("admin config can only be read from localhost"))
		return
	}
	cfg, err := readLocalLLMConfig()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, cfg)
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

func syncIDFromRequest(r *http.Request) (string, error) {
	id := strings.TrimSpace(r.URL.Query().Get("syncid"))
	if id == "" {
		id = strings.TrimSpace(r.URL.Query().Get("key"))
	}
	id = strings.Join(strings.Fields(id), "")
	id = strings.Map(func(r rune) rune {
		switch r {
		case '\u200B', '\u200C', '\u200D', '\uFEFF':
			return -1
		default:
			return r
		}
	}, id)
	if len(id) < 32 || len(id) > 128 {
		return "", errors.New("syncid must be 32-128 characters")
	}
	for _, ch := range id {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' {
			continue
		}
		return "", errors.New("syncid can only contain letters, numbers, or hyphen")
	}
	return id, nil
}

func shortSyncIDHash(syncID string) string {
	sum := sha256.Sum256([]byte(syncID))
	return hex.EncodeToString(sum[:])[:12]
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
