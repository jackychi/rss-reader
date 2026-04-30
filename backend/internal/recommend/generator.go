package recommend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"catreader/backend/internal/store"
)

type Config struct {
	BaseURL         string
	APIKey          string
	Model           string
	PoolSize        int
	RefreshInterval time.Duration
}

type Generator struct {
	store   *store.Store
	http    *http.Client
	cfgMu   sync.RWMutex
	cfg     Config
	mu      sync.Mutex
	running bool
}

func NewGenerator(s *store.Store, cfg Config) *Generator {
	cfg = normalize(cfg)
	return &Generator{
		store: s,
		cfg:   cfg,
		http:  &http.Client{Timeout: 120 * time.Second},
	}
}

func normalize(cfg Config) Config {
	if cfg.PoolSize <= 0 {
		cfg.PoolSize = 50
	}
	if cfg.RefreshInterval <= 0 {
		cfg.RefreshInterval = 12 * time.Hour
	}
	cfg.BaseURL = strings.TrimSpace(strings.TrimRight(cfg.BaseURL, "/"))
	cfg.APIKey = strings.TrimSpace(cfg.APIKey)
	cfg.Model = strings.TrimSpace(cfg.Model)
	return cfg
}

func (g *Generator) config() Config {
	g.cfgMu.RLock()
	defer g.cfgMu.RUnlock()
	return g.cfg
}

func (g *Generator) SetLLMConfig(baseURL, apiKey, model string) {
	g.cfgMu.Lock()
	g.cfg.BaseURL = strings.TrimSpace(strings.TrimRight(baseURL, "/"))
	g.cfg.APIKey = strings.TrimSpace(apiKey)
	g.cfg.Model = strings.TrimSpace(model)
	g.cfgMu.Unlock()
}

func (g *Generator) enabled() bool {
	cfg := g.config()
	return cfg.BaseURL != "" && cfg.APIKey != "" && cfg.Model != ""
}

func (g *Generator) Start(ctx context.Context) {
	if !g.enabled() {
		log.Printf("recommendation generator disabled: LLM not configured")
	}
	ticker := time.NewTicker(g.config().RefreshInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			g.Refresh(ctx)
		}
	}
}

func (g *Generator) Refresh(ctx context.Context) {
	if !g.enabled() {
		return
	}
	if !g.tryStart() {
		return
	}
	defer g.finish()

	cfg := g.config()
	articles, err := g.store.ListArticles(ctx, store.ArticleQuery{Sort: "random", Limit: 200})
	if err != nil {
		log.Printf("recommendation: fetch random articles: %v", err)
		return
	}
	if len(articles) < 10 {
		log.Printf("recommendation: only %d articles, skipping", len(articles))
		return
	}

	picks, err := g.callLLM(ctx, cfg, articles)
	if err != nil {
		log.Printf("recommendation: LLM scoring failed: %v", err)
		return
	}

	if err := g.store.SaveRecommendations(ctx, picks, cfg.Model); err != nil {
		log.Printf("recommendation: save failed: %v", err)
		return
	}
	log.Printf("recommendation: saved %d picks", len(picks))
}

func (g *Generator) callLLM(ctx context.Context, cfg Config, articles []store.Article) ([]store.Recommendation, error) {
	listing := buildListing(articles)

	body, err := json.Marshal(map[string]any{
		"model": cfg.Model,
		"messages": []map[string]string{
			{"role": "system", "content": scoreSystemPrompt(cfg.PoolSize)},
			{"role": "user", "content": listing},
		},
		"temperature": 0.4,
		"max_tokens":  4000,
	})
	if err != nil {
		return nil, err
	}

	url := cfg.BaseURL + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+cfg.APIKey)

	res, err := g.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	var parsed struct {
		Choices []struct {
			Message struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			} `json:"message"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("LLM HTTP %d: %s", res.StatusCode, parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("LLM returned no choices")
	}

	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	content = stripThinkTag(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var picks []struct {
		Index  int    `json:"index"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(content), &picks); err != nil {
		return nil, fmt.Errorf("parse LLM JSON: %w (content: %.200s)", err, content)
	}

	var recs []store.Recommendation
	for _, p := range picks {
		if p.Index >= 0 && p.Index < len(articles) {
			recs = append(recs, store.Recommendation{
				ArticleID: articles[p.Index].ID,
				Reason:    p.Reason,
			})
		}
	}
	if len(recs) > cfg.PoolSize {
		recs = recs[:cfg.PoolSize]
	}
	return recs, nil
}

func buildListing(articles []store.Article) string {
	var b strings.Builder
	for i, a := range articles {
		snippet := a.ContentSnippet
		if len([]rune(snippet)) > 120 {
			snippet = string([]rune(snippet)[:120])
		}
		fmt.Fprintf(&b, "[%d] 【%s】%s (%s)\n%s\n\n", i, a.FeedTitle, a.Title, a.PublishedAt.Format("2006-01-02"), snippet)
	}
	return b.String()
}

func scoreSystemPrompt(poolSize int) string {
	return fmt.Sprintf(`You are a reading curator for an RSS reader app. Given a list of articles, pick the %d most worth reading.
Prefer: unique insights, depth, timeliness, diversity of topics and sources. Avoid duplicates or low-value listicles.
Return ONLY a JSON array of %d objects: [{"index": <0-based index>, "reason": "<one sentence in Chinese>"}]
No markdown fencing, no explanation outside the array.`, poolSize, poolSize)
}

func stripThinkTag(content string) string {
	if !strings.HasPrefix(strings.TrimSpace(content), "<think>") {
		return content
	}
	end := strings.Index(content, "</think>")
	if end < 0 {
		return content
	}
	return strings.TrimSpace(content[end+len("</think>"):])
}

func (g *Generator) tryStart() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.running {
		return false
	}
	g.running = true
	return true
}

func (g *Generator) finish() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.running = false
}
