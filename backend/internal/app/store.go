package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

var errDuplicatePhone = errors.New("phone already exists")

type User struct {
	ID           int64  `json:"id"`
	Phone        string `json:"phone"`
	PasswordHash string
	Role         string `json:"role"`
}

func createUser(ctx context.Context, db *sql.DB, phone, passwordHash, role string) (User, error) {
	res, err := db.ExecContext(ctx, `INSERT INTO users (phone, password_hash, role) VALUES (?, ?, ?)`, phone, passwordHash, role)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return User{}, errDuplicatePhone
		}
		return User{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return User{}, err
	}
	return User{ID: id, Phone: phone, PasswordHash: passwordHash, Role: role}, nil
}

func findUserByPhone(ctx context.Context, db *sql.DB, phone string) (User, error) {
	user := User{}
	err := db.QueryRowContext(ctx, `SELECT id, phone, password_hash, role FROM users WHERE phone = ? LIMIT 1`, phone).Scan(
		&user.ID,
		&user.Phone,
		&user.PasswordHash,
		&user.Role,
	)
	return user, err
}

func findUserByID(ctx context.Context, db *sql.DB, id int64) (User, error) {
	user := User{}
	err := db.QueryRowContext(ctx, `SELECT id, phone, password_hash, role FROM users WHERE id = ? LIMIT 1`, id).Scan(
		&user.ID,
		&user.Phone,
		&user.PasswordHash,
		&user.Role,
	)
	return user, err
}

func countAdmins(ctx context.Context, db *sql.DB) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(1) FROM users WHERE role = 'admin'`).Scan(&n)
	return n, err
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func storeRefreshToken(ctx context.Context, db *sql.DB, userID int64, refreshToken string, expiresAt time.Time) error {
	tokenHash := hashToken(refreshToken)
	_, err := db.ExecContext(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
		userID,
		tokenHash,
		expiresAt,
	)
	return err
}

func isRefreshTokenActive(ctx context.Context, db *sql.DB, refreshToken string) (bool, error) {
	tokenHash := hashToken(refreshToken)
	var exists int
	err := db.QueryRowContext(ctx,
		`SELECT 1 FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
		tokenHash,
	).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func revokeRefreshToken(ctx context.Context, db *sql.DB, refreshToken string) error {
	tokenHash := hashToken(refreshToken)
	_, err := db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`, tokenHash)
	return err
}
