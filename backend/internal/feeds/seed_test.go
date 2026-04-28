package feeds

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaultFeedsParsesMultilineFeedObjects(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "defaultFeeds.js")
	content := `export const defaultFeeds = [
  {
    category: "技术与工程",
    feeds: [
      {
        title: "Example",
        xmlUrl:
          "https://example.com/feed.xml",
      },
      { title: "Inline", xmlUrl: "https://inline.example/feed.xml" },
    ],
  },
]`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := LoadDefaultFeeds(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 feeds, got %d", len(got))
	}
	if got[0].Title != "Example" || got[0].URL != "https://example.com/feed.xml" {
		t.Fatalf("unexpected first feed: %#v", got[0])
	}
	if got[1].Title != "Inline" || got[1].URL != "https://inline.example/feed.xml" {
		t.Fatalf("unexpected second feed: %#v", got[1])
	}
}
