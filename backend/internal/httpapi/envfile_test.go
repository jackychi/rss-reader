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
