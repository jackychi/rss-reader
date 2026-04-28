package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFromEnvLoadsEnvLocalWithoutOverridingEnvironment(t *testing.T) {
	tmp := t.TempDir()
	t.Chdir(tmp)
	t.Setenv("CATREADER_LLM_MODEL", "from-environment")

	envLocal := []byte(`
CATREADER_ADDR=:9090
CATREADER_LLM_BASE_URL="https://example.com/v1"
CATREADER_LLM_API_KEY='local-key'
CATREADER_LLM_MODEL=from-file
`)
	if err := os.WriteFile(filepath.Join(tmp, ".env.local"), envLocal, 0o600); err != nil {
		t.Fatal(err)
	}

	cfg := FromEnv()

	if cfg.Addr != ":9090" {
		t.Fatalf("expected addr from .env.local, got %q", cfg.Addr)
	}
	if cfg.LLMBaseURL != "https://example.com/v1" {
		t.Fatalf("expected base URL from .env.local, got %q", cfg.LLMBaseURL)
	}
	if cfg.LLMAPIKey != "local-key" {
		t.Fatalf("expected API key from .env.local, got %q", cfg.LLMAPIKey)
	}
	if cfg.LLMModel != "from-environment" {
		t.Fatalf("expected environment to override .env.local, got %q", cfg.LLMModel)
	}
}
