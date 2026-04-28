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
CATREADER_USER_DB_HOST=db.example.com
CATREADER_USER_DB_PORT=3307
CATREADER_USER_DB_NAME=catreader
CATREADER_USER_DB_USER=catreader_user
CATREADER_USER_DB_PASSWORD='db secret'
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
	if cfg.UserDB.Driver != "mysql" {
		t.Fatalf("expected default user DB driver mysql, got %q", cfg.UserDB.Driver)
	}
	if cfg.UserDB.Host != "db.example.com" {
		t.Fatalf("expected user DB host from .env.local, got %q", cfg.UserDB.Host)
	}
	if cfg.UserDB.Port != 3307 {
		t.Fatalf("expected user DB port from .env.local, got %d", cfg.UserDB.Port)
	}
	if cfg.UserDB.Database != "catreader" {
		t.Fatalf("expected user DB name from .env.local, got %q", cfg.UserDB.Database)
	}
	if cfg.UserDB.User != "catreader_user" {
		t.Fatalf("expected user DB user from .env.local, got %q", cfg.UserDB.User)
	}
	if cfg.UserDB.Password != "db secret" {
		t.Fatalf("expected user DB password from .env.local, got %q", cfg.UserDB.Password)
	}
}
