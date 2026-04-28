package httpapi

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

func writeLocalLLMEnvFiles(req llmConfigRequest) error {
	rootEnv, backendEnv := localEnvFilePaths()
	// 前端 Ask Cat 和后端栏目介绍生成共用同一组 LLM 配置，但环境变量名不同。
	if err := updateEnvFile(rootEnv, map[string]string{
		"VITE_ASKCAT_BASE_URL":     strings.TrimRight(req.BaseURL, "/"),
		"VITE_ASKCAT_API_KEY":      req.APIKey,
		"VITE_ASKCAT_MODEL":        req.Model,
		"VITE_ASKCAT_CONTEXT_SIZE": strconv.Itoa(normalizeContextSize(req.ContextSize)),
	}); err != nil {
		return err
	}
	return updateEnvFile(backendEnv, map[string]string{
		"CATREADER_LLM_BASE_URL": strings.TrimRight(req.BaseURL, "/"),
		"CATREADER_LLM_API_KEY":  req.APIKey,
		"CATREADER_LLM_MODEL":    req.Model,
	})
}

func localEnvFilePaths() (string, string) {
	// API 可能从仓库根目录或 backend 目录启动，这里按当前工作目录推断两个配置文件位置。
	cwd, err := os.Getwd()
	if err != nil {
		return ".env.local", filepath.Join("backend", ".env.local")
	}
	if exists(filepath.Join(cwd, "src")) && exists(filepath.Join(cwd, "backend")) {
		return filepath.Join(cwd, ".env.local"), filepath.Join(cwd, "backend", ".env.local")
	}
	return filepath.Join(filepath.Dir(cwd), ".env.local"), filepath.Join(cwd, ".env.local")
}

func updateEnvFile(path string, updates map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	var lines []string
	if raw, err := os.ReadFile(path); err == nil {
		lines = strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n")
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	seen := map[string]bool{}
	for i, line := range lines {
		key, ok := envLineKey(line)
		if !ok {
			continue
		}
		value, shouldUpdate := updates[key]
		if !shouldUpdate {
			continue
		}
		lines[i] = key + "=" + formatEnvValue(value)
		seen[key] = true
	}

	// 新增键按字母序追加，保证重复保存时文件内容稳定。
	keys := make([]string, 0, len(updates))
	for key := range updates {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	if len(keys) > 0 && len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) != "" {
		lines = append(lines, "")
	}
	for _, key := range keys {
		lines = append(lines, key+"="+formatEnvValue(updates[key]))
	}

	return os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600)
}

func envLineKey(line string) (string, bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return "", false
	}
	line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
	key, _, ok := strings.Cut(line, "=")
	if !ok {
		return "", false
	}
	key = strings.TrimSpace(key)
	return key, key != ""
}

func formatEnvValue(value string) string {
	value = strings.ReplaceAll(value, "\n", "")
	if value == "" {
		return ""
	}
	if strings.ContainsAny(value, " \t#\"'") {
		return strconv.Quote(value)
	}
	return value
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
