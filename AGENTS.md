# AGENTS.md - ProPets Codebase Guide

This document provides essential information for AI coding agents working on this codebase.

## Project Overview

ProPets is a pet rescue organization accounting system with:
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS 4
- **Backend**: Go 1.22 with net/http (stdlib, no framework)
- **Database**: MySQL 8.4
- **Deployment**: Docker Compose

---

## Build, Lint, Test Commands

### Frontend (`/frontend`)

```bash
# Install dependencies
npm install

# Development server (http://localhost:5173, proxies /api to backend:18080)
npm run dev

# Type check + production build
npm run build

# Lint
npm run lint

# Run all tests
npx vitest run

# Run single test file
npx vitest run src/member-utils.test.js

# Run tests matching pattern
npx vitest run -t "buildEntriesQuery"

# Watch mode
npx vitest
```

### Backend (`/backend`)

```bash
# Run all tests
go test ./...

# Run single package tests
go test ./internal/smoke/...

# Run specific test function
go test -run TestAdd ./internal/smoke/...

# Build server binary
go build -o server ./cmd/server

# Run server (requires env vars)
APP_PORT=8080 DB_HOST=localhost ... go run ./cmd/server
```

### Full Stack (Project Root)

```bash
# Start all services
docker compose up -d

# Run CI tests (backend + frontend)
./scripts/ci-test.sh

# View logs
docker compose logs -f backend
```

---

## Code Style Guidelines

### TypeScript/React (Frontend)

**Imports**
```typescript
// 1. React/external packages
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

// 2. Path aliased imports (@/ = src/)
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

**Naming Conventions**
- Components: `PascalCase` - `LoginPage.tsx`, `RouteGuards.tsx`
- Hooks/stores: `camelCase` with prefix - `useAuthStore`, `useLedgerStore`
- Utilities: `camelCase` - `apiRequest`, `buildEntriesQuery`
- Interfaces: `PascalCase`, descriptive - `LedgerEntry`, `AuthState`

**Component Structure**
```typescript
// Named exports for pages/components
export function LedgerPage() { ... }

// ForwardRef for UI primitives
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(...)
Button.displayName = 'Button'
export { Button }
```

**State Management**
- Zustand for global state (`/stores/*.ts`)
- React Query for server state
- Persist middleware for localStorage

**Styling**
- TailwindCSS 4 with CSS variables: `bg-[var(--primary)]`
- `class-variance-authority` (cva) for variant components
- `cn()` utility for conditional classes (clsx + tailwind-merge)

**Error Handling**
```typescript
// API errors with typed shape
export interface ApiError {
  message: string
  status: number
}

// Catch blocks - log or ignore with comment
} catch {
  // Ignore logout errors
}
```

**TypeScript Rules**
- Strict mode enabled
- No unused locals/parameters
- Never use `as any`, `@ts-ignore`, `@ts-expect-error`

### Go (Backend)

**Package Structure**
```
backend/
  cmd/server/main.go      # Entry point
  cmd/admin-init/main.go  # Admin CLI tool
  internal/
    app/        # Server, config, middleware
    model/      # Domain types
    repository/ # Database layer
    service/    # Business logic
    smoke/      # Smoke tests
```

**Naming Conventions**
- Files: `snake_case.go` - `ledger_service.go`
- Types: `PascalCase` - `LedgerService`, `UserRole`
- Functions: `PascalCase` for exported, `camelCase` for private
- Constants: `PascalCase` - `UserRoleAdmin`

**Error Handling**
```go
// Define sentinel errors
var ErrInvalidMonth = errors.New("invalid month format")

// Return errors, don't panic
if err != nil {
    return fmt.Errorf("failed to parse: %w", err)
}

// Use errors.Is for comparison
if errors.Is(err, service.ErrInvalidMonth) {
    writeErr(w, http.StatusBadRequest, "invalid month")
}
```

**HTTP Handlers**
```go
// Use http.HandlerFunc pattern
func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
    writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

// Middleware chaining
s.mux.Handle("POST /api/ledger/donations",
    s.withAuth(s.withRole("admin", http.HandlerFunc(s.handleCreateDonation))))
```

**JSON Response Pattern**
```go
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(payload)
}

func writeErr(w http.ResponseWriter, status int, message string) {
    writeJSON(w, status, responseError{Error: message})
}
```

---

## Project Conventions

### API Endpoints

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | /api/auth/register | - | - | User registration |
| POST | /api/auth/login | - | - | Login, returns tokens |
| POST | /api/auth/refresh | - | - | Refresh access token |
| GET | /api/ledger/entries | Bearer | any | List ledger entries |
| GET | /api/summary | Bearer | any | Monthly summary |
| POST | /api/ledger/donations | Bearer | admin | Create donation |
| POST | /api/ledger/expenses | Bearer | admin | Create expense |
| DELETE | /api/ledger/entries/{id} | Bearer | admin | Soft delete entry |

### Authentication
- JWT-based with access/refresh tokens
- Access token in `Authorization: Bearer <token>`
- Idempotency via `Idempotency-Key` header or `requestId` body field

### Frontend Routes
- `/login` - Guest only
- `/ledger` - Member view (any authenticated user)
- `/admin/ledger` - Admin only

---

## Testing Guidelines

**Frontend**: Vitest for unit tests
```typescript
import { describe, expect, it } from "vitest"

describe("feature", () => {
  it("does something", () => {
    expect(result).toBe(expected)
  })
})
```

**Backend**: Standard Go testing
```go
func TestAdd(t *testing.T) {
    got := Add(1, 2)
    if got != 3 {
        t.Fatalf("Add(1, 2) = %d, want 3", got)
    }
}
```

---

## Environment Variables

See `.env.example` for all required variables. Key ones:
- `MYSQL_*` - Database credentials
- `JWT_SECRET` - Token signing key
- `BACKEND_PORT` / `FRONTEND_PORT` - Service ports

---

## Important Notes for AI Agents

1. **Path Alias**: Frontend uses `@/*` for `./src/*`
2. **Strict TypeScript**: No type escape hatches allowed
3. **No Framework (Backend)**: Pure net/http, no Gin/Echo/Chi
4. **Chinese UI**: User-facing text is in Chinese
5. **Idempotency**: All write operations require request IDs
6. **Soft Deletes**: Ledger entries use `deleted_at` field
