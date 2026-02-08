package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"propets/backend/internal/model"
	"propets/backend/internal/repository"
)

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

var monthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

var (
	ErrInvalidMonth     = errors.New("invalid month, expected YYYY-MM")
	ErrInvalidEntryType = errors.New("invalid type, expected donation or expense")
	ErrInvalidPage      = errors.New("page must be >= 1")
	ErrInvalidPageSize  = errors.New("pageSize must be between 1 and 100")
)

type LedgerQueryService struct {
	repo repository.LedgerRepository
}

type MonthlySummary struct {
	DonationTotal string `json:"donation_total"`
	ExpenseTotal  string `json:"expense_total"`
	Balance       string `json:"balance"`
}

type ListEntriesInput struct {
	Month    string
	Type     string
	Page     int
	PageSize int
}

type ListEntriesResult struct {
	Items      []model.LedgerEntry `json:"items"`
	Page       int                 `json:"page"`
	PageSize   int                 `json:"page_size"`
	Total      int64               `json:"total"`
	TotalPages int                 `json:"total_pages"`
}

func NewLedgerQueryService(repo repository.LedgerRepository) *LedgerQueryService {
	return &LedgerQueryService{repo: repo}
}

func (s *LedgerQueryService) GetMonthlySummary(ctx context.Context, month string) (MonthlySummary, error) {
	month = strings.TrimSpace(month)
	if err := validateMonth(month); err != nil {
		return MonthlySummary{}, err
	}

	summary, err := s.repo.GetMonthlySummary(ctx, month)
	if err != nil {
		return MonthlySummary{}, err
	}

	return MonthlySummary{
		DonationTotal: summary.DonationTotal,
		ExpenseTotal:  summary.ExpenseTotal,
		Balance:       summary.Balance,
	}, nil
}

func (s *LedgerQueryService) ListEntries(ctx context.Context, input ListEntriesInput) (ListEntriesResult, error) {
	normalized, err := normalizeListEntriesInput(input)
	if err != nil {
		return ListEntriesResult{}, err
	}

	filter := repository.ListLedgerEntriesFilter{
		MonthKey: normalized.Month,
		Type:     model.LedgerEntryType(normalized.Type),
		Limit:    normalized.PageSize,
		Offset:   (normalized.Page - 1) * normalized.PageSize,
	}
	if err := filter.Validate(); err != nil {
		return ListEntriesResult{}, err
	}

	items, err := s.repo.ListEntries(ctx, filter)
	if err != nil {
		return ListEntriesResult{}, err
	}

	total, err := s.repo.CountEntries(ctx, filter)
	if err != nil {
		return ListEntriesResult{}, err
	}

	totalPages := int((total + int64(normalized.PageSize) - 1) / int64(normalized.PageSize))

	return ListEntriesResult{
		Items:      items,
		Page:       normalized.Page,
		PageSize:   normalized.PageSize,
		Total:      total,
		TotalPages: totalPages,
	}, nil
}

func normalizeListEntriesInput(input ListEntriesInput) (ListEntriesInput, error) {
	normalized := ListEntriesInput{
		Month:    strings.TrimSpace(input.Month),
		Type:     strings.TrimSpace(strings.ToLower(input.Type)),
		Page:     input.Page,
		PageSize: input.PageSize,
	}

	if normalized.Page == 0 {
		normalized.Page = defaultPage
	}
	if normalized.PageSize == 0 {
		normalized.PageSize = defaultPageSize
	}

	if normalized.Month != "" {
		if err := validateMonth(normalized.Month); err != nil {
			return ListEntriesInput{}, err
		}
	}

	if normalized.Type != "" && normalized.Type != string(model.LedgerEntryTypeDonation) && normalized.Type != string(model.LedgerEntryTypeExpense) {
		return ListEntriesInput{}, ErrInvalidEntryType
	}

	if normalized.Page < 1 {
		return ListEntriesInput{}, ErrInvalidPage
	}
	if normalized.PageSize < 1 || normalized.PageSize > maxPageSize {
		return ListEntriesInput{}, ErrInvalidPageSize
	}

	return normalized, nil
}

func validateMonth(month string) error {
	if !monthPattern.MatchString(month) {
		return ErrInvalidMonth
	}
	parts := strings.Split(month, "-")
	if len(parts) != 2 {
		return ErrInvalidMonth
	}
	if _, err := strconv.Atoi(parts[0]); err != nil {
		return fmt.Errorf("%w", ErrInvalidMonth)
	}
	if _, err := strconv.Atoi(parts[1]); err != nil {
		return fmt.Errorf("%w", ErrInvalidMonth)
	}
	return nil
}

func (s *LedgerQueryService) SoftDeleteEntry(ctx context.Context, entryID uint64, deletedBy uint64) error {
	return s.repo.SoftDeleteEntry(ctx, entryID, deletedBy)
}
