package feeds

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"catreader/backend/internal/store"
)

var (
	// 直接复用前端 defaultFeeds.js 中的订阅源配置，避免维护两份默认列表。
	defaultFeedItemRE = regexp.MustCompile(`category:\s*"((?:\\.|[^"])*)"|\{\s*title:\s*"((?:\\.|[^"])*)"\s*,\s*xmlUrl:\s*"((?:\\.|[^"])*)"\s*,?\s*\}`)
)

func LoadDefaultFeeds(path string) ([]store.Feed, error) {
	if path == "" {
		path = findDefaultFeedsFile()
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var feeds []store.Feed
	category := ""
	categoryOrder := -1
	order := 0
	matches := defaultFeedItemRE.FindAllStringSubmatch(string(content), -1)
	for _, m := range matches {
		if m[1] != "" {
			category = unquote(m[1])
			categoryOrder++
			order = 0
			continue
		}
		if category == "" {
			continue
		}
		feeds = append(feeds, store.Feed{
			Category:      category,
			CategoryOrder: categoryOrder,
			Title:         unquote(m[2]),
			URL:           unquote(m[3]),
			SortOrder:     order,
		})
		order++
	}
	if len(feeds) == 0 {
		return nil, fmt.Errorf("no feeds parsed from %s", path)
	}
	return feeds, nil
}

func findDefaultFeedsFile() string {
	// 支持从仓库根目录运行 `go run ./backend/...`，也支持在 backend 目录内运行。
	candidates := []string{
		filepath.Join("src", "data", "defaultFeeds.js"),
		filepath.Join("..", "src", "data", "defaultFeeds.js"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return candidates[0]
}

func unquote(s string) string {
	v, err := strconv.Unquote(`"` + s + `"`)
	if err != nil {
		return s
	}
	return v
}
