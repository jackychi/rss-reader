package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"catreader/backend/internal/config"
	"catreader/backend/internal/feedintro"
	"catreader/backend/internal/feeds"
	"catreader/backend/internal/httpapi"
	"catreader/backend/internal/recommend"
	"catreader/backend/internal/rss"
	"catreader/backend/internal/store"
	"catreader/backend/internal/userstate"
)

func main() {
	cfg := config.FromEnv()
	var userStateStore *userstate.Store
	if cfg.UserDB.Configured() {
		log.Printf("CatReader user database config loaded: driver=%s host=%s port=%d database=%s user=%s password_configured=%t",
			cfg.UserDB.Driver,
			cfg.UserDB.Host,
			cfg.UserDB.Port,
			cfg.UserDB.Database,
			cfg.UserDB.User,
			cfg.UserDB.Password != "",
		)
		userStore, err := userstate.Open(context.Background(), cfg.UserDB)
		if err != nil {
			log.Fatalf("open user database: %v", err)
		}
		defer userStore.Close()
		userStateStore = userStore
	}

	// 后端以 SQLite 作为本地持久化层，启动时先确保表结构可用。
	db, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := db.Migrate(context.Background()); err != nil {
		log.Fatalf("migrate database: %v", err)
	}

	seedFeeds, err := feeds.LoadDefaultFeeds(cfg.FeedsFile)
	if err != nil {
		log.Fatalf("load feeds: %v", err)
	}
	if err := db.UpsertFeeds(context.Background(), seedFeeds); err != nil {
		log.Fatalf("seed feeds: %v", err)
	}
	log.Printf("seeded %d feeds", len(seedFeeds))

	// RSS 刷新和栏目介绍生成都在后台运行，HTTP API 只负责触发和查询状态。
	fetcher := rss.NewFetcher(cfg.FetchTimeout)
	refresher := rss.NewRefresher(db, fetcher, cfg.RefreshInterval, cfg.FetchConcurrency)
	introGenerator := feedintro.NewGenerator(db, feedintro.Config{
		BaseURL:         cfg.LLMBaseURL,
		APIKey:          cfg.LLMAPIKey,
		Model:           cfg.LLMModel,
		RefreshInterval: cfg.FeedIntroRefreshInterval,
		CheckInterval:   cfg.FeedIntroCheckInterval,
		Concurrency:     cfg.FeedIntroConcurrency,
	})
	refresher.SetBeforeRefresh(func(ctx context.Context) {
		latestFeeds, err := feeds.LoadDefaultFeeds(cfg.FeedsFile)
		if err != nil {
			log.Printf("reload feeds: %v", err)
			return
		}
		existingFeeds, err := db.ListFeeds(ctx)
		if err != nil {
			log.Printf("list existing feeds before reload: %v", err)
			return
		}
		existingURLs := make(map[string]bool, len(existingFeeds))
		for _, feed := range existingFeeds {
			existingURLs[feed.URL] = true
		}
		newCount := 0
		for _, feed := range latestFeeds {
			if !existingURLs[feed.URL] {
				newCount++
			}
		}
		if err := db.UpsertFeeds(ctx, latestFeeds); err != nil {
			log.Printf("upsert feeds before refresh: %v", err)
			return
		}
		if newCount > 0 {
			log.Printf("detected %d new feed(s); they will be fetched in this refresh", newCount)
		}
	})
	recGenerator := recommend.NewGenerator(db, recommend.Config{
		BaseURL:         cfg.LLMBaseURL,
		APIKey:          cfg.LLMAPIKey,
		Model:           cfg.LLMModel,
		PoolSize:        50,
		RefreshInterval: 12 * time.Hour,
	})
	refresher.SetAfterRefresh(func(ctx context.Context) {
		go introGenerator.RefreshDue(ctx)
		go recGenerator.Refresh(ctx)
	})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 首次启动时数据库没有文章，立即异步抓取一次，避免用户打开页面后看到空列表。
	if count, err := db.ArticleCount(ctx); err != nil {
		log.Printf("count articles: %v", err)
	} else if count == 0 {
		log.Printf("no articles found; starting initial refresh in background")
		go func() {
			refresher.RefreshAll(ctx)
		}()
	} else {
		go introGenerator.RefreshDue(ctx)
		go recGenerator.Refresh(ctx)
	}
	go refresher.Start(ctx)
	go introGenerator.Start(ctx)
	go recGenerator.Start(ctx)

	api := httpapi.NewServer(db, refresher, introGenerator, recGenerator, userStateStore)
	server := &http.Server{
		Addr:         cfg.Addr,
		Handler:      api.Routes(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("CatReader backend listening on %s", cfg.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
