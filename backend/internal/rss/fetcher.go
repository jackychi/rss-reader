package rss

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"catreader/backend/internal/store"
)

type Fetcher struct {
	client *http.Client
}

type FetchResult struct {
	Articles    []store.Article
	Meta        store.FeedFetchMeta
	NotModified bool
}

func NewFetcher(timeout time.Duration) *Fetcher {
	return &Fetcher{
		client: &http.Client{Timeout: timeout},
	}
}

func (f *Fetcher) Fetch(ctx context.Context, feed store.Feed, meta store.FeedFetchMeta) (FetchResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		return FetchResult{}, err
	}
	req.Header.Set("User-Agent", "CatReader/1.0 (+https://github.com/jackychi/rss-reader)")
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, */*")
	// 使用上次保存的 ETag/Last-Modified 做条件请求，减少无变化订阅源的下载量。
	if meta.ETag != "" {
		req.Header.Set("If-None-Match", meta.ETag)
	}
	if meta.LastModified != "" {
		req.Header.Set("If-Modified-Since", meta.LastModified)
	}

	res, err := f.client.Do(req)
	if err != nil {
		return FetchResult{}, err
	}
	defer res.Body.Close()

	nextMeta := store.FeedFetchMeta{
		ETag:         firstNonEmpty(res.Header.Get("ETag"), meta.ETag),
		LastModified: firstNonEmpty(res.Header.Get("Last-Modified"), meta.LastModified),
	}
	if res.StatusCode == http.StatusNotModified {
		return FetchResult{Meta: nextMeta, NotModified: true}, nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return FetchResult{}, fmt.Errorf("upstream HTTP %d", res.StatusCode)
	}

	// RSS 源可能异常返回超大内容，读取时设置上限，避免占用过多内存。
	body, err := io.ReadAll(io.LimitReader(res.Body, 20*1024*1024))
	if err != nil {
		return FetchResult{}, err
	}
	articles, err := parseFeed(body, feed)
	if err != nil {
		return FetchResult{}, err
	}
	return FetchResult{Articles: articles, Meta: nextMeta}, nil
}

type rssDoc struct {
	Channel struct {
		Title string    `xml:"title"`
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	Description string `xml:"description"`
	Content     string `xml:"encoded"`
	Summary     string `xml:"summary"`
	PubDate     string `xml:"pubDate"`
	Published   string `xml:"published"`
	Updated     string `xml:"updated"`
	Enclosure   struct {
		URL    string `xml:"url,attr"`
		Type   string `xml:"type,attr"`
		Length string `xml:"length,attr"`
	} `xml:"enclosure"`
	ItunesImage struct {
		Href string `xml:"href,attr"`
	} `xml:"http://www.itunes.apple.com/dtds/podcast-1.0.dtd image"`
	MediaThumbnail struct {
		URL string `xml:"url,attr"`
	} `xml:"http://search.yahoo.com/mrss/ thumbnail"`
	MediaContent struct {
		URL  string `xml:"url,attr"`
		Type string `xml:"type,attr"`
	} `xml:"http://search.yahoo.com/mrss/ content"`
}

type atomDoc struct {
	Title   string      `xml:"title"`
	Entries []atomEntry `xml:"entry"`
}

type atomEntry struct {
	Title     string     `xml:"title"`
	ID        string     `xml:"id"`
	Links     []atomLink `xml:"link"`
	Content   string     `xml:"content"`
	Summary   string     `xml:"summary"`
	Published string     `xml:"published"`
	Updated   string     `xml:"updated"`
	MediaThumbnail struct {
		URL string `xml:"url,attr"`
	} `xml:"http://search.yahoo.com/mrss/ thumbnail"`
}

type atomLink struct {
	Href   string `xml:"href,attr"`
	Rel    string `xml:"rel,attr"`
	Type   string `xml:"type,attr"`
	Length string `xml:"length,attr"`
}

func parseFeed(body []byte, feed store.Feed) ([]store.Article, error) {
	// RSS 和 Atom 都是 XML，这里先尝试 RSS，再回退到 Atom。
	var rss rssDoc
	if err := xml.Unmarshal(body, &rss); err == nil && len(rss.Channel.Items) > 0 {
		title := firstNonEmpty(strings.TrimSpace(rss.Channel.Title), feed.Title)
		return mapRSSItems(rss.Channel.Items, feed, title), nil
	}

	var atom atomDoc
	if err := xml.Unmarshal(body, &atom); err == nil && len(atom.Entries) > 0 {
		title := firstNonEmpty(strings.TrimSpace(atom.Title), feed.Title)
		return mapAtomEntries(atom.Entries, feed, title), nil
	}

	return nil, fmt.Errorf("no RSS/Atom entries found")
}

func mapRSSItems(items []rssItem, feed store.Feed, feedTitle string) []store.Article {
	now := time.Now().UTC()
	articles := make([]store.Article, 0, len(items))
	for _, item := range items {
		link := strings.TrimSpace(item.Link)
		guid := firstNonEmpty(strings.TrimSpace(item.GUID), link, strings.TrimSpace(item.Title))
		content := firstNonEmpty(strings.TrimSpace(item.Content), strings.TrimSpace(item.Summary), strings.TrimSpace(item.Description))
		published := parseTime(firstNonEmpty(item.PubDate, item.Published, item.Updated), now)
		articles = append(articles, store.Article{
			ID:             articleID(feed.URL, guid, link),
			FeedURL:        feed.URL,
			FeedTitle:      feedTitle,
			Category:       feed.Category,
			Title:          strings.TrimSpace(item.Title),
			Link:           link,
			GUID:           guid,
			Content:        content,
			ContentSnippet: snippet(content),
			ImageURL:       extractImageURL(item.ItunesImage.Href, item.MediaThumbnail.URL, item.MediaContent.URL, item.MediaContent.Type, content),
			Enclosure:      articleEnclosure(item.Enclosure.URL, item.Enclosure.Type, item.Enclosure.Length),
			PublishedAt:    published,
			FetchedAt:      now,
		})
	}
	return articles
}

func mapAtomEntries(entries []atomEntry, feed store.Feed, feedTitle string) []store.Article {
	now := time.Now().UTC()
	articles := make([]store.Article, 0, len(entries))
	for _, entry := range entries {
		link := atomEntryLink(entry.Links)
		guid := firstNonEmpty(strings.TrimSpace(entry.ID), link, strings.TrimSpace(entry.Title))
		content := firstNonEmpty(strings.TrimSpace(entry.Content), strings.TrimSpace(entry.Summary))
		published := parseTime(firstNonEmpty(entry.Published, entry.Updated), now)
		articles = append(articles, store.Article{
			ID:             articleID(feed.URL, guid, link),
			FeedURL:        feed.URL,
			FeedTitle:      feedTitle,
			Category:       feed.Category,
			Title:          strings.TrimSpace(entry.Title),
			Link:           link,
			GUID:           guid,
			Content:        content,
			ContentSnippet: snippet(content),
			ImageURL:       extractImageURL("", entry.MediaThumbnail.URL, "", "", content),
			Enclosure:      atomEntryEnclosure(entry.Links),
			PublishedAt:    published,
			FetchedAt:      now,
		})
	}
	return articles
}

func atomEntryLink(links []atomLink) string {
	for _, link := range links {
		if link.Rel == "" || link.Rel == "alternate" {
			return strings.TrimSpace(link.Href)
		}
	}
	if len(links) > 0 {
		return strings.TrimSpace(links[0].Href)
	}
	return ""
}

func atomEntryEnclosure(links []atomLink) *store.ArticleEnclosure {
	for _, link := range links {
		if link.Rel == "enclosure" {
			return articleEnclosure(link.Href, link.Type, link.Length)
		}
	}
	return nil
}

var imgSrcRe = regexp.MustCompile(`<img[^>]+src=["']([^"']+)["']`)

func extractImageURL(itunesImage, mediaThumbnail, mediaContentURL, mediaContentType, content string) string {
	if u := strings.TrimSpace(itunesImage); u != "" {
		return u
	}
	if u := strings.TrimSpace(mediaThumbnail); u != "" {
		return u
	}
	if u := strings.TrimSpace(mediaContentURL); u != "" && strings.HasPrefix(mediaContentType, "image") {
		return u
	}
	if m := imgSrcRe.FindStringSubmatch(content); len(m) > 1 {
		return html.UnescapeString(m[1])
	}
	return ""
}

func articleEnclosure(url, mediaType, length string) *store.ArticleEnclosure {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil
	}
	return &store.ArticleEnclosure{
		URL:    url,
		Type:   strings.TrimSpace(mediaType),
		Length: strings.TrimSpace(length),
	}
}

func articleID(feedURL, guid, link string) string {
	// 文章 ID 由订阅源和文章稳定标识生成，避免不同源里的相同 GUID 相互覆盖。
	sum := sha256.Sum256([]byte(feedURL + "\x00" + firstNonEmpty(guid, link)))
	return hex.EncodeToString(sum[:])
}

var tagRE = regexp.MustCompile(`<[^>]+>`)
var spaceRE = regexp.MustCompile(`\s+`)

func snippet(content string) string {
	text := html.UnescapeString(tagRE.ReplaceAllString(content, " "))
	text = strings.TrimSpace(spaceRE.ReplaceAllString(text, " "))
	if len([]rune(text)) > 240 {
		return string([]rune(text)[:240])
	}
	return text
}

func parseTime(raw string, fallback time.Time) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	layouts := []string{
		time.RFC1123Z,
		time.RFC1123,
		time.RFC3339,
		time.RFC3339Nano,
		"Mon, 02 Jan 2006 15:04:05 -0700",
		"Mon, 2 Jan 2006 15:04:05 -0700",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.UTC()
		}
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
