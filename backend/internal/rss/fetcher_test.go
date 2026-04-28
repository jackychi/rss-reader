package rss

import (
	"testing"

	"catreader/backend/internal/store"
)

func TestParseRSSEnclosure(t *testing.T) {
	articles, err := parseFeed([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Podcast Feed</title>
    <item>
      <title>Episode 1</title>
      <guid>episode-1</guid>
      <link>https://example.com/episode-1</link>
      <description><![CDATA[Shownotes]]></description>
      <enclosure url="https://cdn.example.com/episode-1.mp3" type="audio/mpeg" length="12345" />
      <pubDate>Tue, 28 Apr 2026 10:00:00 +0800</pubDate>
    </item>
  </channel>
</rss>`), store.Feed{Title: "Podcast Feed", URL: "https://example.com/feed.xml", Category: "播客"})
	if err != nil {
		t.Fatalf("parseFeed() error = %v", err)
	}
	if len(articles) != 1 {
		t.Fatalf("len(articles) = %d, want 1", len(articles))
	}
	if articles[0].Enclosure == nil {
		t.Fatal("article enclosure is nil")
	}
	if articles[0].Enclosure.URL != "https://cdn.example.com/episode-1.mp3" {
		t.Fatalf("enclosure URL = %q", articles[0].Enclosure.URL)
	}
	if articles[0].Enclosure.Type != "audio/mpeg" {
		t.Fatalf("enclosure type = %q", articles[0].Enclosure.Type)
	}
	if articles[0].Enclosure.Length != "12345" {
		t.Fatalf("enclosure length = %q", articles[0].Enclosure.Length)
	}
}

func TestParseAtomEnclosure(t *testing.T) {
	articles, err := parseFeed([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Podcast Feed</title>
  <entry>
    <title>Episode 1</title>
    <id>episode-1</id>
    <link rel="alternate" href="https://example.com/episode-1" />
    <link rel="enclosure" href="https://cdn.example.com/episode-1.m4a" type="audio/mp4" length="67890" />
    <summary>Shownotes</summary>
    <published>2026-04-28T10:00:00+08:00</published>
  </entry>
</feed>`), store.Feed{Title: "Podcast Feed", URL: "https://example.com/feed.atom", Category: "播客"})
	if err != nil {
		t.Fatalf("parseFeed() error = %v", err)
	}
	if len(articles) != 1 {
		t.Fatalf("len(articles) = %d, want 1", len(articles))
	}
	if articles[0].Enclosure == nil {
		t.Fatal("article enclosure is nil")
	}
	if articles[0].Enclosure.URL != "https://cdn.example.com/episode-1.m4a" {
		t.Fatalf("enclosure URL = %q", articles[0].Enclosure.URL)
	}
	if articles[0].Enclosure.Type != "audio/mp4" {
		t.Fatalf("enclosure type = %q", articles[0].Enclosure.Type)
	}
}
