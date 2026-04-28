package rss

import (
	"context"
	"log"
	"sync"
	"time"

	"catreader/backend/internal/store"
)

type Refresher struct {
	store       *store.Store
	fetcher     *Fetcher
	interval    time.Duration
	concurrency int
	before      func(context.Context)
	after       func(context.Context)
	mu          sync.Mutex
	running     bool
}

func NewRefresher(store *store.Store, fetcher *Fetcher, interval time.Duration, concurrency int) *Refresher {
	if concurrency <= 0 {
		concurrency = 5
	}
	return &Refresher{
		store:       store,
		fetcher:     fetcher,
		interval:    interval,
		concurrency: concurrency,
	}
}

func (r *Refresher) SetBeforeRefresh(fn func(context.Context)) {
	r.before = fn
}

func (r *Refresher) SetAfterRefresh(fn func(context.Context)) {
	r.after = fn
}

func (r *Refresher) Start(ctx context.Context) {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.RefreshAll(ctx)
		}
	}
}

func (r *Refresher) RefreshAll(ctx context.Context) {
	if !r.tryStart() {
		log.Printf("refresh already running; skipping")
		return
	}
	defer r.finish()

	if r.before != nil {
		r.before(ctx)
	}

	feeds, err := r.store.ListFeeds(ctx)
	if err != nil {
		log.Printf("list feeds: %v", err)
		return
	}

	jobs := make(chan store.Feed)
	var wg sync.WaitGroup
	// 用固定数量 worker 拉取订阅源，避免同时请求过多站点或占满本地连接。
	for i := 0; i < r.concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for feed := range jobs {
				r.RefreshFeed(ctx, feed)
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

	if r.after != nil {
		r.after(ctx)
	}
}

func (r *Refresher) RefreshFeed(ctx context.Context, feed store.Feed) {
	current, meta, err := r.store.GetFeedByURL(ctx, feed.URL)
	if err != nil {
		log.Printf("get feed %s: %v", feed.URL, err)
		return
	}

	result, err := r.fetcher.Fetch(ctx, current, meta)
	if err != nil {
		log.Printf("fetch %s: %v", current.Title, err)
		if markErr := r.store.MarkFeedFetchFailure(ctx, current.ID, err.Error()); markErr != nil {
			log.Printf("mark fetch failure %s: %v", current.Title, markErr)
		}
		return
	}
	if result.NotModified {
		// 304 没有新文章，但仍保存最新的缓存头和成功时间，便于后续条件请求。
		if err := r.store.SaveArticles(ctx, current, nil, result.Meta); err != nil {
			log.Printf("save not-modified meta %s: %v", current.Title, err)
		}
		return
	}
	if err := r.store.SaveArticles(ctx, current, result.Articles, result.Meta); err != nil {
		log.Printf("save articles %s: %v", current.Title, err)
		return
	}
	log.Printf("refreshed %s: %d articles", current.Title, len(result.Articles))
}

func (r *Refresher) tryStart() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.running {
		return false
	}
	r.running = true
	return true
}

func (r *Refresher) finish() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.running = false
}
