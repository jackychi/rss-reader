package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

type Feed struct {
	ID            int64      `json:"id"`
	Category      string     `json:"category"`
	CategoryOrder int        `json:"categoryOrder"`
	Title         string     `json:"title"`
	URL           string     `json:"url"`
	SortOrder     int        `json:"sortOrder"`
	LastFetchedAt *time.Time `json:"lastFetchedAt,omitempty"`
	LastSuccessAt *time.Time `json:"lastSuccessAt,omitempty"`
	LastError     string     `json:"lastError,omitempty"`
	ArticleCount  int        `json:"articleCount,omitempty"`
	Intro         *FeedIntro `json:"intro,omitempty"`
}

type Article struct {
	ID             string            `json:"id"`
	FeedID         int64             `json:"feedId"`
	FeedURL        string            `json:"feedUrl"`
	FeedTitle      string            `json:"feedTitle"`
	Category       string            `json:"category"`
	Title          string            `json:"title"`
	Link           string            `json:"link"`
	GUID           string            `json:"guid"`
	Content        string            `json:"content,omitempty"`
	ContentSnippet string            `json:"contentSnippet"`
	Enclosure      *ArticleEnclosure `json:"enclosure,omitempty"`
	PublishedAt    time.Time         `json:"publishedAt"`
	FetchedAt      time.Time         `json:"fetchedAt"`
}

type ArticleEnclosure struct {
	URL    string `json:"url,omitempty"`
	Type   string `json:"type,omitempty"`
	Length string `json:"length,omitempty"`
}

type FeedFetchMeta struct {
	ETag         string
	LastModified string
}

type FeedIntro struct {
	FeedID              int64      `json:"feedId"`
	Content             string     `json:"content,omitempty"`
	Model               string     `json:"model,omitempty"`
	PromptVersion       string     `json:"promptVersion,omitempty"`
	ArticlesFingerprint string     `json:"articlesFingerprint,omitempty"`
	GeneratedAt         *time.Time `json:"generatedAt,omitempty"`
	NextRefreshAt       *time.Time `json:"nextRefreshAt,omitempty"`
	LastError           string     `json:"lastError,omitempty"`
}

type ArticleQuery struct {
	FeedURL  string
	Category string
	Search   string
	Sort     string
	Limit    int
	Offset   int
}

type Stats struct {
	FeedCount      int `json:"feedCount"`
	ArticleCount   int `json:"articleCount"`
	FeedIntroCount int `json:"feedIntroCount"`
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// modernc SQLite 驱动在单文件应用里更稳妥地串行写入，避免本地刷新时出现锁竞争。
	db.SetMaxOpenConns(1)
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Migrate(ctx context.Context) error {
	stmts := []string{
		// WAL 让读请求和后台写入尽量并行，适合本地 RSS 刷新场景。
		`PRAGMA journal_mode = WAL`,
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE IF NOT EXISTS feeds (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			category TEXT NOT NULL,
			category_order INTEGER NOT NULL DEFAULT 0,
			title TEXT NOT NULL,
			url TEXT NOT NULL UNIQUE,
			sort_order INTEGER NOT NULL DEFAULT 0,
			etag TEXT NOT NULL DEFAULT '',
			last_modified TEXT NOT NULL DEFAULT '',
			last_fetched_at DATETIME,
			last_success_at DATETIME,
			last_error TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS articles (
			id TEXT PRIMARY KEY,
			feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
			feed_url TEXT NOT NULL,
			feed_title TEXT NOT NULL,
			category TEXT NOT NULL,
			title TEXT NOT NULL,
			link TEXT NOT NULL,
			guid TEXT NOT NULL,
			content TEXT NOT NULL,
			content_snippet TEXT NOT NULL,
			enclosure_url TEXT NOT NULL DEFAULT '',
			enclosure_type TEXT NOT NULL DEFAULT '',
			enclosure_length TEXT NOT NULL DEFAULT '',
			published_at DATETIME NOT NULL,
			fetched_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS feed_intros (
			feed_id INTEGER PRIMARY KEY REFERENCES feeds(id) ON DELETE CASCADE,
			content TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT '',
			prompt_version TEXT NOT NULL DEFAULT '',
			articles_fingerprint TEXT NOT NULL DEFAULT '',
			generated_at DATETIME,
			next_refresh_at DATETIME,
			last_error TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category, sort_order)`,
		`CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url, published_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category, published_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_feed_intros_next_refresh ON feed_intros(next_refresh_at)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	if err := s.addColumnIfMissing(ctx, `ALTER TABLE feeds ADD COLUMN category_order INTEGER NOT NULL DEFAULT 0`); err != nil {
		return err
	}
	if err := s.addColumnIfMissing(ctx, `ALTER TABLE articles ADD COLUMN enclosure_url TEXT NOT NULL DEFAULT ''`); err != nil {
		return err
	}
	if err := s.addColumnIfMissing(ctx, `ALTER TABLE articles ADD COLUMN enclosure_type TEXT NOT NULL DEFAULT ''`); err != nil {
		return err
	}
	if err := s.addColumnIfMissing(ctx, `ALTER TABLE articles ADD COLUMN enclosure_length TEXT NOT NULL DEFAULT ''`); err != nil {
		return err
	}
	return nil
}

func (s *Store) addColumnIfMissing(ctx context.Context, stmt string) error {
	// 轻量迁移：旧数据库缺列时补上，已存在则忽略重复列错误。
	_, err := s.db.ExecContext(ctx, stmt)
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
		return nil
	}
	return err
}

func (s *Store) UpsertFeeds(ctx context.Context, feeds []Feed) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO feeds (category, category_order, title, url, sort_order, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(url) DO UPDATE SET
			category = excluded.category,
			category_order = excluded.category_order,
			title = excluded.title,
			sort_order = excluded.sort_order,
			updated_at = CURRENT_TIMESTAMP`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, feed := range feeds {
		if _, err := stmt.ExecContext(ctx, feed.Category, feed.CategoryOrder, feed.Title, feed.URL, feed.SortOrder); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ListFeeds(ctx context.Context) ([]Feed, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT
			f.id, f.category, f.category_order, f.title, f.url, f.sort_order, f.last_fetched_at,
			f.last_success_at, f.last_error, COUNT(a.id) AS article_count,
			fi.content, fi.model, fi.prompt_version, fi.articles_fingerprint, fi.generated_at,
			fi.next_refresh_at, fi.last_error
		FROM feeds f
		LEFT JOIN articles a ON a.feed_id = f.id
		LEFT JOIN feed_intros fi ON fi.feed_id = f.id
		GROUP BY f.id
		ORDER BY f.category_order, f.sort_order, f.title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var feeds []Feed
	for rows.Next() {
		var feed Feed
		var fetched, success sql.NullTime
		var introContent, introModel, introPromptVersion, introFingerprint, introError sql.NullString
		var introGenerated, introNextRefresh sql.NullTime
		if err := rows.Scan(
			&feed.ID, &feed.Category, &feed.CategoryOrder, &feed.Title, &feed.URL,
			&feed.SortOrder, &fetched, &success, &feed.LastError, &feed.ArticleCount,
			&introContent, &introModel, &introPromptVersion, &introFingerprint,
			&introGenerated, &introNextRefresh, &introError,
		); err != nil {
			return nil, err
		}
		if fetched.Valid {
			feed.LastFetchedAt = &fetched.Time
		}
		if success.Valid {
			feed.LastSuccessAt = &success.Time
		}
		if introContent.Valid || introError.Valid {
			feed.Intro = &FeedIntro{
				FeedID:              feed.ID,
				Content:             introContent.String,
				Model:               introModel.String,
				PromptVersion:       introPromptVersion.String,
				ArticlesFingerprint: introFingerprint.String,
				LastError:           introError.String,
			}
			if introGenerated.Valid {
				feed.Intro.GeneratedAt = &introGenerated.Time
			}
			if introNextRefresh.Valid {
				feed.Intro.NextRefreshAt = &introNextRefresh.Time
			}
		}
		feeds = append(feeds, feed)
	}
	return feeds, rows.Err()
}

func (s *Store) GetFeedByURL(ctx context.Context, url string) (Feed, FeedFetchMeta, error) {
	var feed Feed
	var meta FeedFetchMeta
	var fetched, success sql.NullTime
	err := s.db.QueryRowContext(ctx, `SELECT id, category, category_order, title, url, sort_order, etag, last_modified,
			last_fetched_at, last_success_at, last_error
		FROM feeds WHERE url = ?`, url).
		Scan(&feed.ID, &feed.Category, &feed.CategoryOrder, &feed.Title, &feed.URL, &feed.SortOrder, &meta.ETag, &meta.LastModified, &fetched, &success, &feed.LastError)
	if errors.Is(err, sql.ErrNoRows) {
		return Feed{}, FeedFetchMeta{}, fmt.Errorf("feed not found: %s", url)
	}
	if err != nil {
		return Feed{}, FeedFetchMeta{}, err
	}
	if fetched.Valid {
		feed.LastFetchedAt = &fetched.Time
	}
	if success.Valid {
		feed.LastSuccessAt = &success.Time
	}
	return feed, meta, nil
}

func (s *Store) SaveArticles(ctx context.Context, feed Feed, articles []Article, meta FeedFetchMeta) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO articles (
			id, feed_id, feed_url, feed_title, category, title, link, guid,
			content, content_snippet, enclosure_url, enclosure_type, enclosure_length,
			published_at, fetched_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			feed_id = excluded.feed_id,
			feed_url = excluded.feed_url,
			feed_title = excluded.feed_title,
			category = excluded.category,
			title = excluded.title,
			link = excluded.link,
			guid = excluded.guid,
			content = excluded.content,
			content_snippet = excluded.content_snippet,
			enclosure_url = excluded.enclosure_url,
			enclosure_type = excluded.enclosure_type,
			enclosure_length = excluded.enclosure_length,
			published_at = excluded.published_at,
			fetched_at = excluded.fetched_at,
			updated_at = CURRENT_TIMESTAMP`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, article := range articles {
		enclosureURL, enclosureType, enclosureLength := articleEnclosureFields(article.Enclosure)
		if _, err := stmt.ExecContext(ctx,
			article.ID, feed.ID, feed.URL, feed.Title, feed.Category, article.Title,
			article.Link, article.GUID, article.Content, article.ContentSnippet,
			enclosureURL, enclosureType, enclosureLength,
			article.PublishedAt, article.FetchedAt,
		); err != nil {
			return err
		}
	}

	_, err = tx.ExecContext(ctx, `UPDATE feeds SET
			etag = ?,
			last_modified = ?,
			last_fetched_at = ?,
			last_success_at = ?,
			last_error = '',
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`, meta.ETag, meta.LastModified, time.Now().UTC(), time.Now().UTC(), feed.ID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) MarkFeedFetchFailure(ctx context.Context, feedID int64, message string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE feeds SET
			last_fetched_at = ?,
			last_error = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`, time.Now().UTC(), trim(message, 1000), feedID)
	return err
}

func (s *Store) ListArticles(ctx context.Context, q ArticleQuery) ([]Article, error) {
	limit := q.Limit
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	if q.Offset < 0 {
		q.Offset = 0
	}

	where := []string{"1=1"}
	args := []any{}
	if q.FeedURL != "" {
		where = append(where, "feed_url = ?")
		args = append(args, q.FeedURL)
	}
	if q.Category != "" {
		where = append(where, "category = ?")
		args = append(args, q.Category)
	}
	if q.Search != "" {
		where = append(where, "(title LIKE ? OR content_snippet LIKE ? OR feed_title LIKE ?)")
		term := "%" + q.Search + "%"
		args = append(args, term, term, term)
	}
	orderBy := "published_at DESC"
	if q.Sort == "random" {
		orderBy = "RANDOM()"
	}
	args = append(args, limit, q.Offset)

	rows, err := s.db.QueryContext(ctx, `SELECT id, feed_id, feed_url, feed_title, category, title,
			-- 列表页不返回完整正文，减少接口响应体积；详情页再按 ID 查询 content。
			link, guid, '' AS content, content_snippet, enclosure_url, enclosure_type,
			enclosure_length, published_at, fetched_at
		FROM articles
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY `+orderBy+`
		LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []Article
	for rows.Next() {
		var article Article
		var enclosureURL, enclosureType, enclosureLength string
		if err := rows.Scan(&article.ID, &article.FeedID, &article.FeedURL, &article.FeedTitle, &article.Category, &article.Title, &article.Link, &article.GUID, &article.Content, &article.ContentSnippet, &enclosureURL, &enclosureType, &enclosureLength, &article.PublishedAt, &article.FetchedAt); err != nil {
			return nil, err
		}
		article.Enclosure = articleEnclosure(enclosureURL, enclosureType, enclosureLength)
		articles = append(articles, article)
	}
	return articles, rows.Err()
}

func (s *Store) GetArticle(ctx context.Context, id string) (Article, error) {
	var article Article
	var enclosureURL, enclosureType, enclosureLength string
	err := s.db.QueryRowContext(ctx, `SELECT id, feed_id, feed_url, feed_title, category, title,
			link, guid, content, content_snippet, enclosure_url, enclosure_type,
			enclosure_length, published_at, fetched_at
		FROM articles WHERE id = ?`, id).
		Scan(&article.ID, &article.FeedID, &article.FeedURL, &article.FeedTitle, &article.Category, &article.Title, &article.Link, &article.GUID, &article.Content, &article.ContentSnippet, &enclosureURL, &enclosureType, &enclosureLength, &article.PublishedAt, &article.FetchedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Article{}, err
	}
	article.Enclosure = articleEnclosure(enclosureURL, enclosureType, enclosureLength)
	return article, err
}

func (s *Store) ArticleCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM articles`).Scan(&count)
	return count, err
}

func (s *Store) Stats(ctx context.Context) (Stats, error) {
	var stats Stats
	err := s.db.QueryRowContext(ctx, `SELECT
			(SELECT COUNT(*) FROM feeds),
			(SELECT COUNT(*) FROM articles),
			(SELECT COUNT(*) FROM feed_intros WHERE content != '')
		`).Scan(&stats.FeedCount, &stats.ArticleCount, &stats.FeedIntroCount)
	return stats, err
}

func (s *Store) ListRecentArticlesForFeed(ctx context.Context, feedID int64, limit int) ([]Article, error) {
	if limit <= 0 || limit > 100 {
		limit = 12
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, feed_id, feed_url, feed_title, category, title,
			link, guid, content, content_snippet, enclosure_url, enclosure_type,
			enclosure_length, published_at, fetched_at
		FROM articles
		WHERE feed_id = ?
		ORDER BY published_at DESC
		LIMIT ?`, feedID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []Article
	for rows.Next() {
		var article Article
		var enclosureURL, enclosureType, enclosureLength string
		if err := rows.Scan(&article.ID, &article.FeedID, &article.FeedURL, &article.FeedTitle, &article.Category, &article.Title, &article.Link, &article.GUID, &article.Content, &article.ContentSnippet, &enclosureURL, &enclosureType, &enclosureLength, &article.PublishedAt, &article.FetchedAt); err != nil {
			return nil, err
		}
		article.Enclosure = articleEnclosure(enclosureURL, enclosureType, enclosureLength)
		articles = append(articles, article)
	}
	return articles, rows.Err()
}

func (s *Store) GetFeedIntro(ctx context.Context, feedID int64) (FeedIntro, error) {
	var intro FeedIntro
	var generated, nextRefresh sql.NullTime
	err := s.db.QueryRowContext(ctx, `SELECT feed_id, content, model, prompt_version,
			articles_fingerprint, generated_at, next_refresh_at, last_error
		FROM feed_intros
		WHERE feed_id = ?`, feedID).
		Scan(&intro.FeedID, &intro.Content, &intro.Model, &intro.PromptVersion, &intro.ArticlesFingerprint, &generated, &nextRefresh, &intro.LastError)
	if err != nil {
		return FeedIntro{}, err
	}
	if generated.Valid {
		intro.GeneratedAt = &generated.Time
	}
	if nextRefresh.Valid {
		intro.NextRefreshAt = &nextRefresh.Time
	}
	return intro, nil
}

func (s *Store) ListFeedsDueForIntro(ctx context.Context, now time.Time, model, promptVersion string, limit int) ([]Feed, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `SELECT
			f.id, f.category, f.category_order, f.title, f.url, f.sort_order,
			f.last_fetched_at, f.last_success_at, f.last_error, COUNT(a.id) AS article_count
		FROM feeds f
		LEFT JOIN articles a ON a.feed_id = f.id
		LEFT JOIN feed_intros fi ON fi.feed_id = f.id
		WHERE fi.feed_id IS NULL
			OR fi.next_refresh_at IS NULL
			OR fi.next_refresh_at <= ?
			-- 模型或提示词版本变化时需要重新生成，避免展示旧策略下的介绍。
			OR fi.model != ?
			OR fi.prompt_version != ?
		GROUP BY f.id
		HAVING article_count > 0
		ORDER BY COALESCE(fi.next_refresh_at, '1970-01-01'), f.category_order, f.sort_order
		LIMIT ?`, now, model, promptVersion, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var feeds []Feed
	for rows.Next() {
		var feed Feed
		var fetched, success sql.NullTime
		if err := rows.Scan(&feed.ID, &feed.Category, &feed.CategoryOrder, &feed.Title, &feed.URL, &feed.SortOrder, &fetched, &success, &feed.LastError, &feed.ArticleCount); err != nil {
			return nil, err
		}
		if fetched.Valid {
			feed.LastFetchedAt = &fetched.Time
		}
		if success.Valid {
			feed.LastSuccessAt = &success.Time
		}
		feeds = append(feeds, feed)
	}
	return feeds, rows.Err()
}

func (s *Store) SaveFeedIntro(ctx context.Context, feedID int64, content, model, promptVersion, fingerprint string, generatedAt, nextRefreshAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO feed_intros (
			feed_id, content, model, prompt_version, articles_fingerprint,
			generated_at, next_refresh_at, last_error, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP)
		ON CONFLICT(feed_id) DO UPDATE SET
			content = excluded.content,
			model = excluded.model,
			prompt_version = excluded.prompt_version,
			articles_fingerprint = excluded.articles_fingerprint,
			generated_at = excluded.generated_at,
			next_refresh_at = excluded.next_refresh_at,
			last_error = '',
			updated_at = CURRENT_TIMESTAMP`, feedID, content, model, promptVersion, fingerprint, generatedAt, nextRefreshAt)
	return err
}

func (s *Store) DeferFeedIntro(ctx context.Context, feedID int64, model, promptVersion, fingerprint string, nextRefreshAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO feed_intros (
			feed_id, model, prompt_version, articles_fingerprint, next_refresh_at, updated_at
		) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(feed_id) DO UPDATE SET
			model = excluded.model,
			prompt_version = excluded.prompt_version,
			articles_fingerprint = excluded.articles_fingerprint,
			next_refresh_at = excluded.next_refresh_at,
			updated_at = CURRENT_TIMESTAMP`, feedID, model, promptVersion, fingerprint, nextRefreshAt)
	return err
}

func (s *Store) MarkFeedIntroFailure(ctx context.Context, feedID int64, model, promptVersion, fingerprint, message string, nextRefreshAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO feed_intros (
			feed_id, model, prompt_version, articles_fingerprint, next_refresh_at,
			last_error, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(feed_id) DO UPDATE SET
			model = excluded.model,
			prompt_version = excluded.prompt_version,
			articles_fingerprint = excluded.articles_fingerprint,
			next_refresh_at = excluded.next_refresh_at,
			last_error = excluded.last_error,
			updated_at = CURRENT_TIMESTAMP`, feedID, model, promptVersion, fingerprint, nextRefreshAt, trim(message, 1000))
	return err
}

func articleEnclosureFields(enclosure *ArticleEnclosure) (string, string, string) {
	if enclosure == nil {
		return "", "", ""
	}
	return strings.TrimSpace(enclosure.URL), strings.TrimSpace(enclosure.Type), strings.TrimSpace(enclosure.Length)
}

func articleEnclosure(url, mediaType, length string) *ArticleEnclosure {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil
	}
	return &ArticleEnclosure{
		URL:    url,
		Type:   strings.TrimSpace(mediaType),
		Length: strings.TrimSpace(length),
	}
}

func trim(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
