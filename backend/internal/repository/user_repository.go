package repository

const insertUserSQL = `
INSERT INTO users (phone, password_hash, role)
VALUES (?, ?, ?)
`

const findUserByPhoneSQL = `
SELECT id, phone, password_hash, role, created_at
FROM users
WHERE phone = ?
`
