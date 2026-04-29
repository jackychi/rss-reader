package httpapi

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpdateEnvFilePreservesUnknownValuesAndUpdatesKeys(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, ".env.local")
	if err := os.WriteFile(path, []byte("KEEP_ME=yes\nVITE_ASKCAT_MODEL=old\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	err := updateEnvFile(path, map[string]string{
		"VITE_ASKCAT_MODEL":   "new-model",
		"VITE_ASKCAT_API_KEY": "key with space",
	})
	if err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(raw)
	for _, want := range []string{
		"KEEP_ME=yes",
		"VITE_ASKCAT_MODEL=new-model",
		`VITE_ASKCAT_API_KEY="key with space"`,
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected %q in:\n%s", want, content)
		}
	}
}

func TestReadLocalLLMConfigUsesBackendEnv(t *testing.T) {
	tmp := t.TempDir()
	if err := os.Mkdir(filepath.Join(tmp, "src"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(tmp, "backend"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "backend", ".env.local"), []byte(strings.Join([]string{
		"VITE_ASKCAT_BASE_URL=https://root.example/v1",
		`VITE_ASKCAT_API_KEY="root key"`,
		"VITE_ASKCAT_MODEL=frontend-model",
		"VITE_ASKCAT_CONTEXT_SIZE=45",
		"",
	}, "\n")), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Chdir(tmp)

	cfg, err := readLocalLLMConfig()
	if err != nil {
		t.Fatal(err)
	}

	if cfg.BaseURL != "https://root.example/v1" {
		t.Fatalf("BaseURL = %q, want backend env value", cfg.BaseURL)
	}
	if cfg.APIKey != "root key" {
		t.Fatalf("APIKey = %q, want unquoted backend env value", cfg.APIKey)
	}
	if cfg.Model != "frontend-model" {
		t.Fatalf("Model = %q, want VITE value before CATREADER fallback", cfg.Model)
	}
	if cfg.ContextSize != 45 {
		t.Fatalf("ContextSize = %d, want 45", cfg.ContextSize)
	}
}
