package feedintro

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"catreader/backend/internal/store"
)

const PromptVersion = "feed_intro_v1"

type Config struct {
	BaseURL         string
	APIKey          string
	Model           string
	RefreshInterval time.Duration
	CheckInterval   time.Duration
	Concurrency     int
}

type Generator struct {
	store   *store.Store
	http    *http.Client
	cfgMu   sync.RWMutex
	cfg     Config
	mu      sync.Mutex
	running bool
}

func NewGenerator(store *store.Store, cfg Config) *Generator {
	cfg = normalizeConfig(cfg)
	return &Generator{
		store: store,
		cfg:   cfg,
		http:  &http.Client{Timeout: 60 * time.Second},
	}
}

func normalizeConfig(cfg Config) Config {
	// 生成任务默认低频运行；订阅源介绍对实时性要求不高，优先控制成本和请求量。
	if cfg.RefreshInterval <= 0 {
		cfg.RefreshInterval = 7 * 24 * time.Hour
	}
	if cfg.CheckInterval <= 0 {
		cfg.CheckInterval = time.Hour
	}
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 2
	}
	cfg.BaseURL = strings.TrimSpace(strings.TrimRight(cfg.BaseURL, "/"))
	cfg.APIKey = strings.TrimSpace(cfg.APIKey)
	cfg.Model = strings.TrimSpace(cfg.Model)
	return cfg
}

func (g *Generator) SetConfig(cfg Config) {
	g.cfgMu.Lock()
	g.cfg = normalizeConfig(cfg)
	g.cfgMu.Unlock()
}

func (g *Generator) SetLLMConfig(baseURL, apiKey, model string) {
	cfg := g.config()
	cfg.BaseURL = baseURL
	cfg.APIKey = apiKey
	cfg.Model = model
	g.SetConfig(cfg)
}

func (g *Generator) config() Config {
	g.cfgMu.RLock()
	defer g.cfgMu.RUnlock()
	return g.cfg
}

func (g *Generator) Enabled() bool {
	return configEnabled(g.config())
}

func configEnabled(cfg Config) bool {
	return strings.TrimSpace(cfg.BaseURL) != "" &&
		strings.TrimSpace(cfg.APIKey) != "" &&
		strings.TrimSpace(cfg.Model) != ""
}

func (g *Generator) Start(ctx context.Context) {
	cfg := g.config()
	if !configEnabled(cfg) {
		log.Printf("feed intro generator disabled: CATREADER_LLM_BASE_URL/API_KEY/MODEL not fully configured")
	}
	// 即使启动时未配置 LLM，也持续轮询；用户后续从前端保存配置后会立即生效。
	ticker := time.NewTicker(cfg.CheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			g.RefreshDue(ctx)
		}
	}
}

func (g *Generator) RefreshDue(ctx context.Context) {
	cfg := g.config()
	if !configEnabled(cfg) {
		return
	}
	if !g.tryStart() {
		log.Printf("feed intro refresh already running; skipping")
		return
	}
	defer g.finish()

	feeds, err := g.store.ListFeedsDueForIntro(ctx, time.Now().UTC(), cfg.Model, PromptVersion, 200)
	if err != nil {
		log.Printf("list feed intro jobs: %v", err)
		return
	}
	if len(feeds) == 0 {
		return
	}

	jobs := make(chan store.Feed)
	var wg sync.WaitGroup
	for i := 0; i < cfg.Concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for feed := range jobs {
				if err := g.RefreshFeed(ctx, feed); err != nil {
					log.Printf("refresh feed intro %s: %v", feed.Title, err)
				}
			}
		}()
	}
	for _, feed := range feeds {
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return
		case jobs <- feed:
		}
	}
	close(jobs)
	wg.Wait()
}

func (g *Generator) RefreshFeed(ctx context.Context, feed store.Feed) error {
	cfg := g.config()
	if !configEnabled(cfg) {
		return nil
	}
	articles, err := g.store.ListRecentArticlesForFeed(ctx, feed.ID, 12)
	if err != nil {
		return err
	}
	if len(articles) == 0 {
		return nil
	}

	// fingerprint 只和最近文章内容相关；未变化时推迟下一次检查，避免重复调用 LLM。
	fingerprint := ArticlesFingerprint(articles)
	now := time.Now().UTC()
	nextRefresh := now.Add(cfg.RefreshInterval)

	existing, err := g.store.GetFeedIntro(ctx, feed.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil &&
		existing.Content != "" &&
		existing.Model == cfg.Model &&
		existing.PromptVersion == PromptVersion &&
		existing.ArticlesFingerprint == fingerprint {
		return g.store.DeferFeedIntro(ctx, feed.ID, cfg.Model, PromptVersion, fingerprint, nextRefresh)
	}

	content, err := g.callLLM(ctx, cfg, feed, articles)
	if err != nil {
		_ = g.store.MarkFeedIntroFailure(ctx, feed.ID, cfg.Model, PromptVersion, fingerprint, err.Error(), now.Add(time.Hour))
		return err
	}
	if content == "" {
		err := errors.New("LLM returned empty feed intro")
		_ = g.store.MarkFeedIntroFailure(ctx, feed.ID, cfg.Model, PromptVersion, fingerprint, err.Error(), now.Add(time.Hour))
		return err
	}
	if err := g.store.SaveFeedIntro(ctx, feed.ID, content, cfg.Model, PromptVersion, fingerprint, now, nextRefresh); err != nil {
		return err
	}
	log.Printf("generated feed intro %s", feed.Title)
	return nil
}

func ArticlesFingerprint(articles []store.Article) string {
	// 固定按发布时间排序并截取最近 12 篇，保证同一批文章生成稳定指纹。
	cp := append([]store.Article(nil), articles...)
	sort.Slice(cp, func(i, j int) bool {
		return cp[i].PublishedAt.After(cp[j].PublishedAt)
	})
	if len(cp) > 12 {
		cp = cp[:12]
	}
	var b strings.Builder
	for _, article := range cp {
		b.WriteString(article.ID)
		b.WriteByte('|')
		b.WriteString(article.PublishedAt.Format(time.RFC3339Nano))
		b.WriteByte('|')
		b.WriteString(article.Title)
		b.WriteString("||")
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}

func (g *Generator) callLLM(ctx context.Context, cfg Config, feed store.Feed, articles []store.Article) (string, error) {
	body := chatCompletionRequest{
		Model:       cfg.Model,
		Messages:    buildMessages(feed, articles),
		Temperature: 0.3,
		MaxTokens:   1000,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	url := strings.TrimRight(cfg.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+cfg.APIKey)

	res, err := g.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	var parsed chatCompletionResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		if parsed.Error.Message != "" {
			return "", fmt.Errorf("LLM API HTTP %d: %s", res.StatusCode, parsed.Error.Message)
		}
		return "", fmt.Errorf("LLM API HTTP %d", res.StatusCode)
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("LLM response has no choices")
	}
	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	return stripThinkTag(content), nil
}

type chatCompletionRequest struct {
	Model       string    `json:"model"`
	Messages    []message `json:"messages"`
	Temperature float64   `json:"temperature"`
	MaxTokens   int       `json:"max_tokens"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message message `json:"message"`
	} `json:"choices"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func buildMessages(feed store.Feed, articles []store.Article) []message {
	recentArticles := formatRecentArticles(articles)
	return []message{
		{
			Role:    "system",
			Content: "你是 CatReader 里的 RSS 栏目编辑。根据栏目最近文章，写一个中文栏目介绍，帮助读者判断这个订阅源主要关注什么。不要编造文章列表之外的信息。",
		},
		{
			Role: "user",
			Content: fmt.Sprintf(`订阅源: %s
Feed URL: %s

最近文章:
%s

请输出:
- 1 句总体定位
- 2 到 3 个主要关注方向
- 1 句适合什么读者

要求简洁、自然，不超过 180 字。`, feed.Title, feed.URL, recentArticles),
		},
	}
}

func formatRecentArticles(articles []store.Article) string {
	// 只给模型最近文章标题、日期和摘要，减少 token 消耗，也降低无关正文干扰。
	cp := append([]store.Article(nil), articles...)
	sort.Slice(cp, func(i, j int) bool {
		return cp[i].PublishedAt.After(cp[j].PublishedAt)
	})
	if len(cp) > 12 {
		cp = cp[:12]
	}
	lines := make([]string, 0, len(cp))
	for i, article := range cp {
		snippet := article.ContentSnippet
		if snippet == "" {
			snippet = plainText(article.Content)
		}
		if len([]rune(snippet)) > 180 {
			snippet = string([]rune(snippet)[:180])
		}
		lines = append(lines, fmt.Sprintf("%d. %s (%s)\n%s", i+1, article.Title, article.PublishedAt.Format("2006-01-02"), snippet))
	}
	return strings.Join(lines, "\n\n")
}

var tagRE = regexp.MustCompile(`<[^>]+>`)
var spaceRE = regexp.MustCompile(`\s+`)

func plainText(input string) string {
	text := html.UnescapeString(tagRE.ReplaceAllString(input, " "))
	return strings.TrimSpace(spaceRE.ReplaceAllString(text, " "))
}

func stripThinkTag(content string) string {
	// 兼容部分推理模型返回的 <think>...</think>，只保留最终可展示文本。
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
