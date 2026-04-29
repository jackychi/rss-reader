package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr                     string
	DBPath                   string
	FeedsFile                string
	UserDB                   UserDBConfig
	RefreshInterval          time.Duration
	FetchTimeout             time.Duration
	FetchConcurrency         int
	LLMBaseURL               string
	LLMAPIKey                string
	LLMModel                 string
	FeedIntroRefreshInterval time.Duration
	FeedIntroCheckInterval   time.Duration
	FeedIntroConcurrency     int
}

type UserDBConfig struct {
	Driver   string
	Host     string
	Port     int
	Database string
	User     string
	Password string
}

func (c UserDBConfig) Configured() bool {
	return c.Host != "" || c.Database != "" || c.User != "" || c.Password != ""
}

func FromEnv() Config {
	// 先加载 backend/.env.local，再读取环境变量；显式环境变量始终优先。
	loadEnvLocal()

	return Config{
		Addr:      env("CATREADER_ADDR", ":8080"),
		DBPath:    env("CATREADER_DB_PATH", filepath.Join("data", "catreader.db")),
		FeedsFile: env("CATREADER_FEEDS_FILE", ""),
		UserDB: UserDBConfig{
			Driver:   env("CATREADER_USER_DB_DRIVER", "mysql"),
			Host:     env("CATREADER_USER_DB_HOST", ""),
			Port:     envInt("CATREADER_USER_DB_PORT", 3306),
			Database: env("CATREADER_USER_DB_NAME", ""),
			User:     env("CATREADER_USER_DB_USER", ""),
			Password: env("CATREADER_USER_DB_PASSWORD", ""),
		},
		RefreshInterval:          envDuration("CATREADER_REFRESH_INTERVAL", 10*time.Minute),
		FetchTimeout:             envDuration("CATREADER_FETCH_TIMEOUT", 20*time.Second),
		FetchConcurrency:         envInt("CATREADER_FETCH_CONCURRENCY", 5),
		LLMBaseURL:               env("CATREADER_LLM_BASE_URL", env("VITE_ASKCAT_BASE_URL", "")),
		LLMAPIKey:                env("CATREADER_LLM_API_KEY", env("VITE_ASKCAT_API_KEY", "")),
		LLMModel:                 env("CATREADER_LLM_MODEL", env("VITE_ASKCAT_MODEL", "")),
		FeedIntroRefreshInterval: envDuration("CATREADER_FEED_INTRO_REFRESH_INTERVAL", 7*24*time.Hour),
		FeedIntroCheckInterval:   envDuration("CATREADER_FEED_INTRO_CHECK_INTERVAL", time.Hour),
		FeedIntroConcurrency:     envInt("CATREADER_FEED_INTRO_CONCURRENCY", 2),
	}
}

func loadEnvLocal() {
	_ = loadEnvFile(backendEnvPath())
}

func backendEnvPath() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ".env.local"
	}
	if exists(filepath.Join(cwd, "src")) && exists(filepath.Join(cwd, "backend")) {
		return filepath.Join(cwd, "backend", ".env.local")
	}
	if filepath.Base(cwd) == "backend" {
		return filepath.Join(cwd, ".env.local")
	}
	parentBackend := filepath.Join(filepath.Dir(cwd), "backend", ".env.local")
	if exists(parentBackend) {
		return parentBackend
	}
	return filepath.Join(cwd, ".env.local")
}

func loadEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
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
		value = strings.TrimSpace(value)
		if key == "" || os.Getenv(key) != "" {
			continue
		}
		if len(value) >= 2 {
			// 兼容 shell 风格的引号，方便直接复用前端/后端本地配置文件。
			quote := value[0]
			if (quote == '"' || quote == '\'') && value[len(value)-1] == quote {
				if unquoted, err := strconv.Unquote(value); err == nil {
					value = unquoted
				} else {
					value = value[1 : len(value)-1]
				}
			}
		}
		_ = os.Setenv(key, value)
	}
	return scanner.Err()
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func envDuration(key string, fallback time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := time.ParseDuration(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}
