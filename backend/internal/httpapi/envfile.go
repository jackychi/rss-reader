package httpapi

import (
	"bufio"
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

func readLocalLLMConfig() (llmConfigRequest, error) {
	rootEnv, backendEnv := localEnvFilePaths()
	values := map[string]string{}
	for _, path := range []string{rootEnv, backendEnv} {
		fileValues, err := readEnvFileValues(path)
		if err != nil {
			return llmConfigRequest{}, err
		}
		for key, value := range fileValues {
			if values[key] == "" {
				values[key] = value
			}
		}
	}

	contextSize := 30
	if raw := firstNonEmpty(values["VITE_ASKCAT_CONTEXT_SIZE"], os.Getenv("VITE_ASKCAT_CONTEXT_SIZE")); raw != "" {
		contextSize, _ = strconv.Atoi(raw)
	}

	return llmConfigRequest{
		BaseURL: strings.TrimRight(firstNonEmpty(
			values["VITE_ASKCAT_BASE_URL"],
			values["CATREADER_LLM_BASE_URL"],
			os.Getenv("VITE_ASKCAT_BASE_URL"),
			os.Getenv("CATREADER_LLM_BASE_URL"),
		), "/"),
		APIKey: firstNonEmpty(
			values["VITE_ASKCAT_API_KEY"],
			values["CATREADER_LLM_API_KEY"],
			os.Getenv("VITE_ASKCAT_API_KEY"),
			os.Getenv("CATREADER_LLM_API_KEY"),
		),
		Model: firstNonEmpty(
			values["VITE_ASKCAT_MODEL"],
			values["CATREADER_LLM_MODEL"],
			os.Getenv("VITE_ASKCAT_MODEL"),
			os.Getenv("CATREADER_LLM_MODEL"),
		),
		ContextSize: normalizeContextSize(contextSize),
	}, nil
}

func readEnvFileValues(path string) (map[string]string, error) {
	values := map[string]string{}
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return values, nil
		}
		return values, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		values[key] = unquoteEnvValue(strings.TrimSpace(value))
	}
	return values, scanner.Err()
}

func unquoteEnvValue(value string) string {
	if len(value) < 2 {
		return value
	}
	quote := value[0]
	if (quote != '"' && quote != '\'') || value[len(value)-1] != quote {
		return value
	}
	if unquoted, err := strconv.Unquote(value); err == nil {
		return unquoted
	}
	return value[1 : len(value)-1]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
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
