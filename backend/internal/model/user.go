package model

import "time"

type UserRole string

const (
	UserRoleAdmin  UserRole = "admin"
	UserRoleMember UserRole = "member"
)

type User struct {
	ID           uint64
	Phone        string
	PasswordHash string
	Role         UserRole
	CreatedAt    time.Time
}
