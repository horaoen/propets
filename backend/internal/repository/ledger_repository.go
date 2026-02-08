package repository

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"time"

	"propets/backend/internal/model"
)

type CreateLedgerEntryInput struct {
	UserID      uint64
	EntryType   model.LedgerEntryType
	Amount      string
	OccurredAt  time.Time
	Description string
}

type ListLedgerEntriesFilter struct {
	MonthKey string
	Type     model.LedgerEntryType
	Limit    int
	Offset   int
}

type MonthlySummary struct {
	DonationTotal string
	ExpenseTotal  string
	Balance       string
}

type LedgerRepository interface {
	CreateEntry(ctx context.Context, input CreateLedgerEntryInput) (uint64, error)
	CreateEntryWithRequestID(ctx context.Context, input CreateLedgerEntryInput, requestID string) (uint64, bool, error)
	GetEntryByID(ctx context.Context, entryID uint64) (model.LedgerEntry, error)
	ListEntries(ctx context.Context, filter ListLedgerEntriesFilter) ([]model.LedgerEntry, error)
	CountEntries(ctx context.Context, filter ListLedgerEntriesFilter) (int64, error)
	GetMonthlySummary(ctx context.Context, monthKey string) (MonthlySummary, error)
	SoftDeleteEntry(ctx context.Context, entryID uint64, deletedBy uint64) error
}

type SQLLedgerRepository struct {
	db *sql.DB
}

func NewSQLLedgerRepository(db *sql.DB) *SQLLedgerRepository {
	return &SQLLedgerRepository{db: db}
}

const insertLedgerEntrySQL = `
INSERT INTO ledger_entries (user_id, entry_type, amount, occurred_at, description)
VALUES (?, ?, ?, ?, ?)
`

const listLedgerEntriesBaseSQL = `
SELECT id, user_id, entry_type, amount, occurred_at, description, month_key, created_at
FROM ledger_entries
`

const insertLedgerIdempotencySQL = `
INSERT INTO ledger_idempotency_keys (request_id, operation, created_by, entry_id)
VALUES (?, ?, ?, NULL)
`

const findLedgerIdempotencySQL = `
SELECT operation, created_by, entry_id
FROM ledger_idempotency_keys
WHERE request_id = ?
LIMIT 1
`

const updateLedgerIdempotencyResultSQL = `
UPDATE ledger_idempotency_keys
SET entry_id = ?
WHERE request_id = ?
`

const getLedgerEntryByIDSQL = `
SELECT id, user_id, entry_type, amount, occurred_at, description, month_key, created_at
FROM ledger_entries
WHERE id = ?
LIMIT 1
`

var (
	ErrLedgerEntryNotFound      = errors.New("ledger entry not found")
	ErrEntryAlreadyDeleted      = errors.New("entry already deleted")
	ErrIdempotencyConflict      = errors.New("idempotency key already used by another request")
	ErrIdempotencyRequestLocked = errors.New("idempotent request is still in progress")
	ErrInvalidMonthFilter       = errors.New("invalid month filter")
	ErrInvalidTypeFilter        = errors.New("invalid type filter")
)

var monthFilterPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

func (r *SQLLedgerRepository) CreateEntry(ctx context.Context, input CreateLedgerEntryInput) (uint64, error) {
	res, err := r.db.ExecContext(ctx, insertLedgerEntrySQL, input.UserID, input.EntryType, input.Amount, input.OccurredAt, input.Description)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	return uint64(id), nil
}

func (r *SQLLedgerRepository) GetEntryByID(ctx context.Context, entryID uint64) (model.LedgerEntry, error) {
	entry := model.LedgerEntry{}
	err := r.db.QueryRowContext(ctx, getLedgerEntryByIDSQL, entryID).Scan(
		&entry.ID,
		&entry.UserID,
		&entry.EntryType,
		&entry.Amount,
		&entry.OccurredAt,
		&entry.Description,
		&entry.MonthKey,
		&entry.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return model.LedgerEntry{}, ErrLedgerEntryNotFound
	}
	return entry, err
}

func (r *SQLLedgerRepository) CreateEntryWithRequestID(ctx context.Context, input CreateLedgerEntryInput, requestID string) (uint64, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, false, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	existingID, reused, err := reserveIdempotencyKey(ctx, tx, requestID, string(input.EntryType), input.UserID)
	if err != nil {
		return 0, false, err
	}
	if reused {
		if commitErr := tx.Commit(); commitErr != nil {
			return 0, false, commitErr
		}
		return existingID, true, nil
	}

	res, execErr := tx.ExecContext(ctx, insertLedgerEntrySQL, input.UserID, input.EntryType, input.Amount, input.OccurredAt, input.Description)
	if execErr != nil {
		err = execErr
		return 0, false, err
	}
	insertedID, lastIDErr := res.LastInsertId()
	if lastIDErr != nil {
		err = lastIDErr
		return 0, false, err
	}

	if _, err = tx.ExecContext(ctx, updateLedgerIdempotencyResultSQL, insertedID, requestID); err != nil {
		return 0, false, err
	}

	if err = tx.Commit(); err != nil {
		return 0, false, err
	}
	return uint64(insertedID), false, nil
}

func reserveIdempotencyKey(ctx context.Context, tx *sql.Tx, requestID, operation string, createdBy uint64) (uint64, bool, error) {
	_, err := tx.ExecContext(ctx, insertLedgerIdempotencySQL, requestID, operation, createdBy)
	if err == nil {
		return 0, false, nil
	}
	if !strings.Contains(strings.ToLower(err.Error()), "duplicate") {
		return 0, false, err
	}

	var existingOp string
	var existingUserID uint64
	var existingEntryID sql.NullInt64
	if err := tx.QueryRowContext(ctx, findLedgerIdempotencySQL, requestID).Scan(&existingOp, &existingUserID, &existingEntryID); err != nil {
		return 0, false, err
	}
	if existingOp != operation || existingUserID != createdBy {
		return 0, false, ErrIdempotencyConflict
	}
	if !existingEntryID.Valid {
		return 0, false, ErrIdempotencyRequestLocked
	}
	return uint64(existingEntryID.Int64), true, nil
}

func (r *SQLLedgerRepository) SoftDeleteEntry(ctx context.Context, entryID uint64, deletedBy uint64) error {
	const checkDeletedSQL = `SELECT deleted_at FROM ledger_entries WHERE id = ? LIMIT 1`
	var deletedAt sql.NullTime
	err := r.db.QueryRowContext(ctx, checkDeletedSQL, entryID).Scan(&deletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrLedgerEntryNotFound
	}
	if err != nil {
		return err
	}
	if deletedAt.Valid {
		return ErrEntryAlreadyDeleted
	}

	const softDeleteSQL = `UPDATE ledger_entries SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL`
	res, err := r.db.ExecContext(ctx, softDeleteSQL, deletedBy, entryID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrEntryAlreadyDeleted
	}
	return nil
}

func (r *SQLLedgerRepository) ListEntries(ctx context.Context, filter ListLedgerEntriesFilter) ([]model.LedgerEntry, error) {
	if err := filter.Validate(); err != nil {
		return nil, err
	}
	whereSQL, args := buildLedgerFilterClause(filter)

	query := listLedgerEntriesBaseSQL + whereSQL + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
	args = append(args, filter.Limit, filter.Offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]model.LedgerEntry, 0)
	for rows.Next() {
		item := model.LedgerEntry{}
		if err := rows.Scan(&item.ID, &item.UserID, &item.EntryType, &item.Amount, &item.OccurredAt, &item.Description, &item.MonthKey, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (r *SQLLedgerRepository) CountEntries(ctx context.Context, filter ListLedgerEntriesFilter) (int64, error) {
	if err := filter.Validate(); err != nil {
		return 0, err
	}
	whereSQL, args := buildLedgerFilterClause(filter)

	query := "SELECT COUNT(1) FROM ledger_entries" + whereSQL
	var total int64
	if err := r.db.QueryRowContext(ctx, query, args...).Scan(&total); err != nil {
		return 0, err
	}

	return total, nil
}

func (r *SQLLedgerRepository) GetMonthlySummary(ctx context.Context, monthKey string) (MonthlySummary, error) {
	monthKey = strings.TrimSpace(monthKey)
	if monthKey == "" || !monthFilterPattern.MatchString(monthKey) {
		return MonthlySummary{}, ErrInvalidMonthFilter
	}

	const summarySQL = `
SELECT
	COALESCE(SUM(CASE WHEN entry_type = 'donation' THEN amount ELSE 0 END), 0) AS donation_total,
	COALESCE(SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END), 0) AS expense_total,
	COALESCE(SUM(CASE WHEN entry_type = 'donation' THEN amount ELSE -amount END), 0) AS balance
FROM ledger_entries
WHERE month_key = ? AND deleted_at IS NULL
`

	var out MonthlySummary
	if err := r.db.QueryRowContext(ctx, summarySQL, monthKey).Scan(&out.DonationTotal, &out.ExpenseTotal, &out.Balance); err != nil {
		return MonthlySummary{}, err
	}

	return out, nil
}

func (f ListLedgerEntriesFilter) Validate() error {
	if f.MonthKey != "" && !monthFilterPattern.MatchString(strings.TrimSpace(f.MonthKey)) {
		return ErrInvalidMonthFilter
	}
	if f.Type != "" && f.Type != model.LedgerEntryTypeDonation && f.Type != model.LedgerEntryTypeExpense {
		return ErrInvalidTypeFilter
	}
	if f.Limit < 0 || f.Offset < 0 {
		return errors.New("limit and offset must be >= 0")
	}
	return nil
}

func buildLedgerFilterClause(filter ListLedgerEntriesFilter) (string, []interface{}) {
	clauses := []string{"deleted_at IS NULL"}
	args := make([]interface{}, 0, 2)

	if filter.MonthKey != "" {
		clauses = append(clauses, "month_key = ?")
		args = append(args, filter.MonthKey)
	}
	if filter.Type != "" {
		clauses = append(clauses, "entry_type = ?")
		args = append(args, string(filter.Type))
	}

	return " WHERE " + strings.Join(clauses, " AND "), args
}
