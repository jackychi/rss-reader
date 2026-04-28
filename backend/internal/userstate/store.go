package userstate

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"catreader/backend/internal/config"

	"github.com/go-sql-driver/mysql"
)

const Version = 2

type Store struct {
	db *sql.DB
}

type State struct {
	Version        int                       `json:"version"`
	UpdatedAt      int64                     `json:"updatedAt"`
	ReadStatus     []ReadStatusRecord        `json:"readStatus"`
	ReadingList    []map[string]any          `json:"readingList"`
	ReadPositions  map[string]PositionRecord `json:"readPositions"`
	AudioPositions map[string]PositionRecord `json:"audioPositions"`
}

type ReadStatusRecord struct {
	ArticleKey string `json:"articleKey"`
	Status     string `json:"status"`
	ReadAt     int64  `json:"readAt,omitempty"`
	UpdatedAt  int64  `json:"updatedAt"`
}

type PositionRecord struct {
	Position  float64 `json:"position"`
	UpdatedAt int64   `json:"updatedAt"`
}

func Open(ctx context.Context, cfg config.UserDBConfig) (*Store, error) {
	if cfg.Driver != "mysql" {
		return nil, fmt.Errorf("unsupported user database driver %q", cfg.Driver)
	}
	if cfg.Host == "" || cfg.Database == "" || cfg.User == "" || cfg.Password == "" {
		return nil, errors.New("user database config requires host, database, user, and password")
	}

	mysqlCfg := mysql.Config{
		User:                 cfg.User,
		Passwd:               cfg.Password,
		Net:                  "tcp",
		Addr:                 fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		DBName:               cfg.Database,
		ParseTime:            true,
		AllowNativePasswords: true,
		Params: map[string]string{
			"charset": "utf8mb4",
		},
	}
	db, err := sql.Open("mysql", mysqlCfg.FormatDSN())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(30 * time.Minute)

	store := &Store{db: db}
	if err := store.Migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Migrate(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS catreader_read_status (
			sync_id VARCHAR(128) NOT NULL,
			article_hash CHAR(64) NOT NULL,
			article_key TEXT NOT NULL,
			status VARCHAR(16) NOT NULL DEFAULT 'read',
			read_at BIGINT NOT NULL DEFAULT 0,
			updated_at BIGINT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at_db TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (sync_id, article_hash),
			INDEX idx_catreader_read_status_sync_updated (sync_id, updated_at)
		) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS catreader_reading_list (
			sync_id VARCHAR(128) NOT NULL,
			article_hash CHAR(64) NOT NULL,
			article_key TEXT NOT NULL,
			item_json JSON NOT NULL,
			saved_at BIGINT NOT NULL DEFAULT 0,
			removed_at BIGINT NOT NULL DEFAULT 0,
			updated_at BIGINT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at_db TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (sync_id, article_hash),
			INDEX idx_catreader_reading_list_sync_updated (sync_id, updated_at)
		) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS catreader_read_positions (
			sync_id VARCHAR(128) NOT NULL,
			article_hash CHAR(64) NOT NULL,
			article_key TEXT NOT NULL,
			position DOUBLE NOT NULL DEFAULT 0,
			updated_at BIGINT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at_db TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (sync_id, article_hash),
			INDEX idx_catreader_read_positions_sync_updated (sync_id, updated_at)
		) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS catreader_audio_positions (
			sync_id VARCHAR(128) NOT NULL,
			article_hash CHAR(64) NOT NULL,
			article_key TEXT NOT NULL,
			position DOUBLE NOT NULL DEFAULT 0,
			updated_at BIGINT NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at_db TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (sync_id, article_hash),
			INDEX idx_catreader_audio_positions_sync_updated (sync_id, updated_at)
		) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) GetState(ctx context.Context, syncID string) (State, error) {
	state := State{
		Version:        Version,
		UpdatedAt:      nowMillis(),
		ReadStatus:     []ReadStatusRecord{},
		ReadingList:    []map[string]any{},
		ReadPositions:  map[string]PositionRecord{},
		AudioPositions: map[string]PositionRecord{},
	}

	readRows, err := s.db.QueryContext(ctx, `SELECT article_key, status, read_at, updated_at
		FROM catreader_read_status WHERE sync_id = ?`, syncID)
	if err != nil {
		return state, err
	}
	defer readRows.Close()
	for readRows.Next() {
		var rec ReadStatusRecord
		if err := readRows.Scan(&rec.ArticleKey, &rec.Status, &rec.ReadAt, &rec.UpdatedAt); err != nil {
			return state, err
		}
		state.ReadStatus = append(state.ReadStatus, rec)
	}
	if err := readRows.Err(); err != nil {
		return state, err
	}

	listRows, err := s.db.QueryContext(ctx, `SELECT item_json FROM catreader_reading_list WHERE sync_id = ?`, syncID)
	if err != nil {
		return state, err
	}
	defer listRows.Close()
	for listRows.Next() {
		var raw []byte
		if err := listRows.Scan(&raw); err != nil {
			return state, err
		}
		var item map[string]any
		if err := json.Unmarshal(raw, &item); err != nil {
			return state, err
		}
		state.ReadingList = append(state.ReadingList, item)
	}
	if err := listRows.Err(); err != nil {
		return state, err
	}

	if err := s.loadPositions(ctx, "catreader_read_positions", syncID, state.ReadPositions); err != nil {
		return state, err
	}
	if err := s.loadPositions(ctx, "catreader_audio_positions", syncID, state.AudioPositions); err != nil {
		return state, err
	}
	return state, nil
}

func (s *Store) SaveState(ctx context.Context, syncID string, state State) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, rec := range state.ReadStatus {
		rec = normalizeReadStatus(rec)
		if rec.ArticleKey == "" {
			continue
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO catreader_read_status
			(sync_id, article_hash, article_key, status, read_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				article_key = IF(VALUES(updated_at) >= updated_at, VALUES(article_key), article_key),
				status = IF(VALUES(updated_at) >= updated_at, VALUES(status), status),
				read_at = IF(VALUES(updated_at) >= updated_at, VALUES(read_at), read_at),
				updated_at = GREATEST(updated_at, VALUES(updated_at))`,
			syncID, articleHash(rec.ArticleKey), rec.ArticleKey, rec.Status, rec.ReadAt, rec.UpdatedAt)
		if err != nil {
			return err
		}
	}

	for _, item := range state.ReadingList {
		key := itemKey(item)
		if key == "" {
			continue
		}
		updatedAt := itemUpdatedAt(item)
		item["id"] = key
		if _, ok := item["updatedAt"]; !ok {
			item["updatedAt"] = updatedAt
		}
		raw, err := json.Marshal(item)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO catreader_reading_list
			(sync_id, article_hash, article_key, item_json, saved_at, removed_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				article_key = IF(VALUES(updated_at) >= updated_at, VALUES(article_key), article_key),
				item_json = IF(VALUES(updated_at) >= updated_at, VALUES(item_json), item_json),
				saved_at = IF(VALUES(updated_at) >= updated_at, VALUES(saved_at), saved_at),
				removed_at = IF(VALUES(updated_at) >= updated_at, VALUES(removed_at), removed_at),
				updated_at = GREATEST(updated_at, VALUES(updated_at))`,
			syncID, articleHash(key), key, string(raw), int64Field(item, "savedAt"), int64Field(item, "removedAt"), updatedAt)
		if err != nil {
			return err
		}
	}

	if err := savePositions(ctx, tx, "catreader_read_positions", syncID, state.ReadPositions); err != nil {
		return err
	}
	if err := savePositions(ctx, tx, "catreader_audio_positions", syncID, state.AudioPositions); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) loadPositions(ctx context.Context, table, syncID string, target map[string]PositionRecord) error {
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`SELECT article_key, position, updated_at FROM %s WHERE sync_id = ?`, table), syncID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var rec PositionRecord
		if err := rows.Scan(&key, &rec.Position, &rec.UpdatedAt); err != nil {
			return err
		}
		target[key] = rec
	}
	return rows.Err()
}

func savePositions(ctx context.Context, tx *sql.Tx, table, syncID string, positions map[string]PositionRecord) error {
	for key, rec := range positions {
		if key == "" {
			continue
		}
		if rec.UpdatedAt == 0 {
			rec.UpdatedAt = nowMillis()
		}
		_, err := tx.ExecContext(ctx, fmt.Sprintf(`INSERT INTO %s
			(sync_id, article_hash, article_key, position, updated_at)
			VALUES (?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				article_key = IF(VALUES(updated_at) >= updated_at, VALUES(article_key), article_key),
				position = IF(VALUES(updated_at) >= updated_at, VALUES(position), position),
				updated_at = GREATEST(updated_at, VALUES(updated_at))`, table),
			syncID, articleHash(key), key, rec.Position, rec.UpdatedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

func normalizeReadStatus(rec ReadStatusRecord) ReadStatusRecord {
	if rec.Status == "" {
		rec.Status = "read"
	}
	if rec.UpdatedAt == 0 {
		if rec.ReadAt > 0 {
			rec.UpdatedAt = rec.ReadAt
		} else {
			rec.UpdatedAt = nowMillis()
		}
	}
	if rec.Status == "read" && rec.ReadAt == 0 {
		rec.ReadAt = rec.UpdatedAt
	}
	return rec
}

func itemKey(item map[string]any) string {
	for _, key := range []string{"id", "articleKey"} {
		if value, ok := item[key].(string); ok && value != "" {
			return value
		}
	}
	feedURL, _ := item["feedUrl"].(string)
	guid, _ := item["guid"].(string)
	link, _ := item["link"].(string)
	if feedURL == "" {
		return ""
	}
	if guid != "" {
		return feedURL + "-" + guid
	}
	if link != "" {
		return feedURL + "-" + link
	}
	return ""
}

func itemUpdatedAt(item map[string]any) int64 {
	if v := int64Field(item, "updatedAt"); v > 0 {
		return v
	}
	if v := int64Field(item, "removedAt"); v > 0 {
		return v
	}
	if v := int64Field(item, "savedAt"); v > 0 {
		return v
	}
	return nowMillis()
}

func int64Field(item map[string]any, key string) int64 {
	switch value := item[key].(type) {
	case int64:
		return value
	case int:
		return int64(value)
	case float64:
		return int64(value)
	case json.Number:
		v, _ := value.Int64()
		return v
	default:
		return 0
	}
}

func articleHash(articleKey string) string {
	sum := sha256.Sum256([]byte(articleKey))
	return hex.EncodeToString(sum[:])
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}
