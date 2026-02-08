package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"

	"propets/backend/internal/model"
	"propets/backend/internal/repository"
	"propets/backend/internal/service"
)

type contextKey string

const userContextKey contextKey = "authUser"

type Server struct {
	cfg           Config
	db            *sql.DB
	tokens        *TokenManager
	ledgerWriter  *service.LedgerService
	ledgerQueries *service.LedgerQueryService
	mux           *http.ServeMux
	http          *http.Server
}

type authContextUser struct {
	ID    int64
	Phone string
	Role  string
}

type authRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type amountValidationRequest struct {
	Amount string `json:"amount"`
}

type donationCreateRequest struct {
	Donor     string `json:"donor"`
	DonatedAt string `json:"donatedAt"`
	Amount    string `json:"amount"`
	RequestID string `json:"requestId"`
}

type expenseCreateRequest struct {
	Purpose    string `json:"purpose"`
	Amount     string `json:"amount"`
	HandledBy  string `json:"handledBy"`
	OccurredAt string `json:"occurredAt"`
	RequestID  string `json:"requestId"`
}

type responseError struct {
	Error string `json:"error"`
}

type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

func NewServer(cfg Config) (*Server, error) {
	db, err := sql.Open("mysql", cfg.DSN())
	if err != nil {
		return nil, err
	}
	db.SetConnMaxLifetime(3 * time.Minute)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	s := &Server{
		cfg:           cfg,
		db:            db,
		tokens:        NewTokenManager(cfg.JWTSecret, cfg.AccessTokenTTL, cfg.RefreshTokenTTL),
		ledgerWriter:  service.NewLedgerService(repository.NewSQLLedgerRepository(db)),
		ledgerQueries: service.NewLedgerQueryService(repository.NewSQLLedgerRepository(db)),
		mux:           http.NewServeMux(),
	}
	s.registerRoutes()
	s.http = &http.Server{
		Addr:              ":" + cfg.AppPort,
		Handler:           s.mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	if cfg.AdminInitEnabled {
		if err := s.InitFirstAdmin(context.Background(), cfg.AdminInitPhone, cfg.AdminInitPass); err != nil {
			return nil, err
		}
	}

	return s, nil
}

func (s *Server) Close() error {
	return s.db.Close()
}

func (s *Server) ListenAndServe() error {
	log.Printf("backend listening on %s", s.http.Addr)
	return s.http.ListenAndServe()
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /", s.handleRoot)

	s.mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	s.mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	s.mux.HandleFunc("POST /api/auth/refresh", s.handleRefresh)
	s.mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	s.mux.HandleFunc("POST /api/ledger/validate-amount", s.handleValidateAmount)
	s.mux.Handle("POST /api/ledger/donations", s.withAuth(s.withRole("admin", http.HandlerFunc(s.handleCreateDonation))))
	s.mux.Handle("POST /api/ledger/expenses", s.withAuth(s.withRole("admin", http.HandlerFunc(s.handleCreateExpense))))
	s.mux.Handle("DELETE /api/ledger/entries/{id}", s.withAuth(s.withRole("admin", http.HandlerFunc(s.handleDeleteEntry))))
	s.mux.Handle("GET /api/summary", s.withAuth(http.HandlerFunc(s.handleSummary)))
	s.mux.Handle("GET /api/ledger/entries", s.withAuth(http.HandlerFunc(s.handleLedgerEntries)))

	s.mux.Handle("GET /api/admin/ping", s.withAuth(s.withRole("admin", http.HandlerFunc(s.handleAdminPing))))
	s.mux.HandleFunc("POST /api/admin/init", s.handleAdminInit)
}

func (s *Server) handleSummary(w http.ResponseWriter, r *http.Request) {
	month := strings.TrimSpace(r.URL.Query().Get("month"))
	summary, err := s.ledgerQueries.GetMonthlySummary(r.Context(), month)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidMonth):
			writeErr(w, http.StatusBadRequest, "invalid month")
		default:
			writeErr(w, http.StatusInternalServerError, "failed to fetch summary")
		}
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

type ledgerEntriesResponseItem struct {
	ID          uint64 `json:"id"`
	UserID      uint64 `json:"user_id"`
	EntryType   string `json:"entry_type"`
	Amount      string `json:"amount"`
	OccurredAt  string `json:"occurred_at"`
	Description string `json:"description"`
	MonthKey    string `json:"month_key"`
	CreatedAt   string `json:"created_at"`
}

func (s *Server) handleLedgerEntries(w http.ResponseWriter, r *http.Request) {
	page, err := parsePositiveQueryInt(r, "page")
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	pageSize, err := parsePositiveQueryInt(r, "pageSize")
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.ledgerQueries.ListEntries(r.Context(), service.ListEntriesInput{
		Month:    r.URL.Query().Get("month"),
		Type:     r.URL.Query().Get("type"),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidMonth):
			writeErr(w, http.StatusBadRequest, "invalid month")
		case errors.Is(err, service.ErrInvalidEntryType):
			writeErr(w, http.StatusBadRequest, "invalid type")
		case errors.Is(err, service.ErrInvalidPage):
			writeErr(w, http.StatusBadRequest, "invalid page")
		case errors.Is(err, service.ErrInvalidPageSize):
			writeErr(w, http.StatusBadRequest, "invalid pageSize")
		default:
			writeErr(w, http.StatusInternalServerError, "failed to list ledger entries")
		}
		return
	}

	items := make([]ledgerEntriesResponseItem, 0, len(result.Items))
	for _, entry := range result.Items {
		items = append(items, ledgerEntriesResponseItem{
			ID:          entry.ID,
			UserID:      entry.UserID,
			EntryType:   string(entry.EntryType),
			Amount:      entry.Amount,
			OccurredAt:  entry.OccurredAt.Format(time.RFC3339),
			Description: entry.Description,
			MonthKey:    entry.MonthKey,
			CreatedAt:   entry.CreatedAt.Format(time.RFC3339),
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":       items,
		"page":        result.Page,
		"page_size":   result.PageSize,
		"total":       result.Total,
		"total_pages": result.TotalPages,
	})
}

func (s *Server) handleCreateDonation(w http.ResponseWriter, r *http.Request) {
	var req donationCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user := authUserFromContext(r.Context())
	entryID, _, err := s.ledgerWriter.CreateDonation(r.Context(), service.DonationInput{
		ActorUserID: uint64(user.ID),
		Donor:       req.Donor,
		DonatedAt:   req.DonatedAt,
		Amount:      req.Amount,
		RequestID:   extractRequestID(r.Header.Get("Idempotency-Key"), req.RequestID),
	})
	if err != nil {
		handleLedgerWriteError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{"entryId": entryID})
}

func (s *Server) handleCreateExpense(w http.ResponseWriter, r *http.Request) {
	var req expenseCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user := authUserFromContext(r.Context())
	entryID, _, err := s.ledgerWriter.CreateExpense(r.Context(), service.ExpenseInput{
		ActorUserID: uint64(user.ID),
		Purpose:     req.Purpose,
		Amount:      req.Amount,
		HandledBy:   req.HandledBy,
		OccurredAt:  req.OccurredAt,
		RequestID:   extractRequestID(r.Header.Get("Idempotency-Key"), req.RequestID),
	})
	if err != nil {
		handleLedgerWriteError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{"entryId": entryID})
}

func (s *Server) handleDeleteEntry(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	entryID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || entryID == 0 {
		writeErr(w, http.StatusBadRequest, "invalid entry id")
		return
	}

	user := authUserFromContext(r.Context())
	if err := s.ledgerQueries.SoftDeleteEntry(r.Context(), entryID, uint64(user.ID)); err != nil {
		switch {
		case errors.Is(err, repository.ErrLedgerEntryNotFound):
			writeErr(w, http.StatusNotFound, "entry not found")
		case errors.Is(err, repository.ErrEntryAlreadyDeleted):
			writeErr(w, http.StatusConflict, "entry already deleted")
		default:
			writeErr(w, http.StatusInternalServerError, "failed to delete entry")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func handleLedgerWriteError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repository.ErrLedgerEntryNotFound):
		writeErr(w, http.StatusNotFound, "target entry not found")
	case errors.Is(err, repository.ErrIdempotencyConflict):
		writeErr(w, http.StatusConflict, "idempotency key conflict")
	case errors.Is(err, repository.ErrIdempotencyRequestLocked):
		writeErr(w, http.StatusConflict, "request is in progress")
	default:
		if isValidationErr(err) {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		writeErr(w, http.StatusInternalServerError, "failed to write ledger entry")
	}
}

func isValidationErr(err error) bool {
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "required") || strings.Contains(message, "invalid") || strings.Contains(message, "amount")
}

func extractRequestID(headerValue, bodyValue string) string {
	headerValue = strings.TrimSpace(headerValue)
	if headerValue != "" {
		return headerValue
	}
	return strings.TrimSpace(bodyValue)
}

func (s *Server) handleValidateAmount(w http.ResponseWriter, r *http.Request) {
	var req amountValidationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := model.ValidateAmount(req.Amount); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok", Service: "backend"})
}

func (s *Server) handleRoot(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("pet rescue accounting backend"))
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeAuthRequest(w, r)
	if !ok {
		return
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user, err := createUser(r.Context(), s.db, req.Phone, hash, "member")
	if err != nil {
		if errors.Is(err, errDuplicatePhone) {
			writeErr(w, http.StatusConflict, "phone already registered")
			return
		}
		writeErr(w, http.StatusInternalServerError, "failed to register")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":    user.ID,
		"phone": user.Phone,
		"role":  user.Role,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeAuthRequest(w, r)
	if !ok {
		return
	}

	user, err := findUserByPhone(r.Context(), s.db, req.Phone)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, http.StatusUnauthorized, "invalid phone or password")
			return
		}
		writeErr(w, http.StatusInternalServerError, "failed to login")
		return
	}
	if !CheckPassword(user.PasswordHash, req.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid phone or password")
		return
	}

	tokenPair, _, refreshExpiresAt, err := s.tokens.GenerateTokenPair(UserClaims{UserID: user.ID, Phone: user.Phone, Role: user.Role})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	if err := storeRefreshToken(r.Context(), s.db, user.ID, tokenPair.RefreshToken, refreshExpiresAt); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to persist refresh token")
		return
	}

	writeJSON(w, http.StatusOK, tokenPair)
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		writeErr(w, http.StatusBadRequest, "refreshToken is required")
		return
	}

	claims, err := s.tokens.ParseToken(req.RefreshToken)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	if claims["type"] != "refresh" {
		writeErr(w, http.StatusUnauthorized, "invalid refresh token type")
		return
	}
	active, err := isRefreshTokenActive(r.Context(), s.db, req.RefreshToken)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to validate refresh token")
		return
	}
	if !active {
		writeErr(w, http.StatusUnauthorized, "refresh token is revoked or expired")
		return
	}

	sub, _ := claims["sub"].(string)
	userID, err := strconv.ParseInt(sub, 10, 64)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid token subject")
		return
	}
	user, err := findUserByID(r.Context(), s.db, userID)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "user not found")
		return
	}

	if err := revokeRefreshToken(r.Context(), s.db, req.RefreshToken); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to rotate refresh token")
		return
	}
	tokenPair, _, refreshExpiresAt, err := s.tokens.GenerateTokenPair(UserClaims{UserID: user.ID, Phone: user.Phone, Role: user.Role})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	if err := storeRefreshToken(r.Context(), s.db, user.ID, tokenPair.RefreshToken, refreshExpiresAt); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to persist refresh token")
		return
	}

	writeJSON(w, http.StatusOK, tokenPair)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		writeErr(w, http.StatusBadRequest, "refreshToken is required")
		return
	}
	if _, err := s.tokens.ParseToken(req.RefreshToken); err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	if err := revokeRefreshToken(r.Context(), s.db, req.RefreshToken); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to logout")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminPing(w http.ResponseWriter, r *http.Request) {
	user := authUserFromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"role":   user.Role,
		"phone":  user.Phone,
	})
}

func (s *Server) handleAdminInit(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.InitFirstAdmin(r.Context(), req.Phone, req.Password); err != nil {
		switch {
		case errors.Is(err, errInvalidAdminInitInput):
			writeErr(w, http.StatusBadRequest, err.Error())
		default:
			writeErr(w, http.StatusInternalServerError, "failed to init admin")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

var errInvalidAdminInitInput = errors.New("phone and password are required")

func (s *Server) InitFirstAdmin(ctx context.Context, phone, password string) error {
	phone = normalizePhone(phone)
	password = strings.TrimSpace(password)
	if phone == "" || password == "" {
		return errInvalidAdminInitInput
	}

	admins, err := countAdmins(ctx, s.db)
	if err != nil {
		return err
	}
	if admins > 0 {
		return nil
	}

	existing, err := findUserByPhone(ctx, s.db, phone)
	if err == nil {
		if existing.Role == "admin" {
			return nil
		}
		_, err = s.db.ExecContext(ctx, `UPDATE users SET role = 'admin' WHERE id = ?`, existing.ID)
		return err
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	_, err = createUser(ctx, s.db, phone, hash, "admin")
	if errors.Is(err, errDuplicatePhone) {
		return nil
	}
	return err
}

func (s *Server) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			writeErr(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		tokenString := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		claims, err := s.tokens.ParseToken(tokenString)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if claims["type"] != "access" {
			writeErr(w, http.StatusUnauthorized, "invalid access token type")
			return
		}
		sub, _ := claims["sub"].(string)
		userID, err := strconv.ParseInt(sub, 10, 64)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid token subject")
			return
		}
		phone, _ := claims["phone"].(string)
		role, _ := claims["role"].(string)
		ctx := context.WithValue(r.Context(), userContextKey, authContextUser{ID: userID, Phone: phone, Role: role})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) withRole(requiredRole string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := authUserFromContext(r.Context())
		if user.Role != requiredRole {
			writeErr(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authUserFromContext(ctx context.Context) authContextUser {
	value := ctx.Value(userContextKey)
	if value == nil {
		return authContextUser{}
	}
	user, _ := value.(authContextUser)
	return user
}

func decodeAuthRequest(w http.ResponseWriter, r *http.Request) (authRequest, bool) {
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return authRequest{}, false
	}
	req.Phone = normalizePhone(req.Phone)
	req.Password = strings.TrimSpace(req.Password)
	if req.Phone == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "phone and password are required")
		return authRequest{}, false
	}
	return req, true
}

func parsePositiveQueryInt(r *http.Request, key string) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return 0, nil
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid %s", key)
	}
	if v < 1 {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return v, nil
}

func normalizePhone(phone string) string {
	return strings.TrimSpace(phone)
}

func writeErr(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, responseError{Error: message})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to write json response: %v", err)
	}
}

func (s *Server) AdminInitScript() string {
	return fmt.Sprintf("APP_PORT=%s go run ./cmd/admin-init", s.cfg.AppPort)
}
