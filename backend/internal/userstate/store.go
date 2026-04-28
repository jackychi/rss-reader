package userstate

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
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
	const maxAttempts = 3
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err := s.saveStateOnce(ctx, syncID, state)
		if err == nil {
			return nil
		}
		lastErr = err
		if !isRetryableMySQLError(err) || attempt == maxAttempts {
			return err
		}
		timer := time.NewTimer(time.Duration(attempt*50) * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return lastErr
}

func (s *Store) saveStateOnce(ctx context.Context, syncID string, state State) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	readStatus := append([]ReadStatusRecord(nil), state.ReadStatus...)
	sort.Slice(readStatus, func(i, j int) bool {
		return articleHash(readStatus[i].ArticleKey) < articleHash(readStatus[j].ArticleKey)
	})
	readStatusArgs := make([]any, 0, len(readStatus)*6)
	for _, rec := range readStatus {
		rec = normalizeReadStatus(rec)
		if rec.ArticleKey == "" {
			continue
		}
		readStatusArgs = append(readStatusArgs,
			syncID, articleHash(rec.ArticleKey), rec.ArticleKey, rec.Status, rec.ReadAt, rec.UpdatedAt)
	}
	if err := execBatchUpsert(ctx, tx, `INSERT INTO catreader_read_status
		(sync_id, article_hash, article_key, status, read_at, updated_at)
		VALUES {{VALUES}}
		ON DUPLICATE KEY UPDATE
			article_key = IF(VALUES(updated_at) >= updated_at, VALUES(article_key), article_key),
			status = IF(VALUES(updated_at) >= updated_at, VALUES(status), status),
			read_at = IF(VALUES(updated_at) >= updated_at, VALUES(read_at), read_at),
			updated_at = GREATEST(updated_at, VALUES(updated_at))`,
		6, readStatusArgs, 500); err != nil {
		return err
	}

	readingList := append([]map[string]any(nil), state.ReadingList...)
	sort.Slice(readingList, func(i, j int) bool {
		return articleHash(itemKey(readingList[i])) < articleHash(itemKey(readingList[j]))
	})
	readingListArgs := make([]any, 0, len(readingList)*7)
	for _, item := range readingList {
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
		readingListArgs = append(readingListArgs,
			syncID, articleHash(key), key, string(raw),
			int64Field(item, "savedAt"), int64Field(item, "removedAt"), updatedAt)
	}
	// item_json 单行较大,batch_size 比 readStatus 保守一档,避开 max_allowed_packet 风险。
	if err := execBatchUpsert(ctx, tx, `INSERT INTO catreader_reading_list
		(sync_id, article_hash, article_key, item_json, saved_at, removed_at, updated_at)
		VALUES {{VALUES}}
		ON DUPLICATE KEY UPDATE
			article_key = IF(VALUES(updated_at) >= updated_at, VALUES(article_key), article_key),
			item_json = IF(VALUES(updated_at) >= updated_at, VALUES(item_json), item_json),
			saved_at = IF(VALUES(updated_at) >= updated_at, VALUES(saved_at), saved_at),
			removed_at = IF(VALUES(updated_at) >= updated_at, VALUES(removed_at), removed_at),
			updated_at = GREATEST(updated_at, VALUES(updated_at))`,
		7, readingListArgs, 250); err != nil {
		return err
	}

	if err := savePositions(ctx, tx, "catreader_read_positions", syncID, state.ReadPositions); err != nil {
		return err
	}
	if err := savePositions(ctx, tx, "catreader_audio_positions", syncID, state.AudioPositions); err != nil {
		return err
	}
	return tx.Commit()
}

func isRetryableMySQLError(err error) bool {
	var mysqlErr *mysql.MySQLError
	if !errors.As(err, &mysqlErr) {
		return false
	}
	return mysqlErr.Number == 1213 || mysqlErr.Number == 1205
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
	if len(positions) == 0 {
		return nil
	}
	keys := make([]string, 0, len(positions))
	for key := range positions {
		if key == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		return articleHash(keys[i]) < articleHash(keys[j])
	})
	args := make([]any, 0, len(keys)*5)
	for _, key := range keys {
		rec := positions[key]
		if rec.UpdatedAt == 0 {
			rec.UpdatedAt = nowMillis()
		}
		args = append(args, syncID, articleHash(key), key, rec.Position, rec.UpdatedAt)
	}
	return execBatchUpsert(ctx, tx, fmt.Sprintf(`INSERT INTO %s
		(sync_id, article_hash, article_key, position, updated_at)
		VALUES {{VALUES}}
		ON DUPLICATE KEY UPDATE
			article_key = IF(VALUES(updated_at) >= updated_at, VALUES(article_key), article_key),
			position = IF(VALUES(updated_at) >= updated_at, VALUES(position), position),
			updated_at = GREATEST(updated_at, VALUES(updated_at))`, table),
		5, args, 500)
}

// 把单条 INSERT...ON DUPLICATE KEY UPDATE 模板批量化。query 里用 {{VALUES}} 占位,
// 调用方按 columns 个数拼好 args(总长度必须是 columns 的整数倍),helper 按 batchSize
// 切片后一次只发一条 SQL。这样 N 条 RTT 降到 ⌈N/batchSize⌉ 条 RTT。
func execBatchUpsert(ctx context.Context, tx *sql.Tx, query string, columns int, args []any, batchSize int) error {
	if columns <= 0 || len(args) == 0 {
		return nil
	}
	if len(args)%columns != 0 {
		return fmt.Errorf("execBatchUpsert: args length %d not multiple of columns %d", len(args), columns)
	}
	if batchSize <= 0 {
		batchSize = 500
	}
	rowCount := len(args) / columns
	rowPlaceholder := "(" + strings.Repeat("?,", columns-1) + "?)"

	for start := 0; start < rowCount; start += batchSize {
		end := start + batchSize
		if end > rowCount {
			end = rowCount
		}
		var sb strings.Builder
		for i := 0; i < end-start; i++ {
			if i > 0 {
				sb.WriteByte(',')
			}
			sb.WriteString(rowPlaceholder)
		}
		stmt := strings.Replace(query, "{{VALUES}}", sb.String(), 1)
		slice := args[start*columns : end*columns]
		if _, err := tx.ExecContext(ctx, stmt, slice...); err != nil {
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
