package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"propets/backend/internal/model"
	"propets/backend/internal/repository"
)

type DonationInput struct {
	ActorUserID uint64
	Donor       string
	DonatedAt   string
	Amount      string
	RequestID   string
}

type ExpenseInput struct {
	ActorUserID uint64
	Purpose     string
	Amount      string
	HandledBy   string
	OccurredAt  string
	RequestID   string
}

type UpdateLedgerEntryInput struct {
	EntryID    uint64
	Donor      string
	DonatedAt  string
	Purpose    string
	HandledBy  string
	OccurredAt string
	Amount     string
}

type LedgerService struct {
	repo repository.LedgerRepository
}

func NewLedgerService(repo repository.LedgerRepository) *LedgerService {
	return &LedgerService{repo: repo}
}

func (s *LedgerService) CreateDonation(ctx context.Context, input DonationInput) (uint64, bool, error) {
	donor := strings.TrimSpace(input.Donor)
	if donor == "" {
		return 0, false, errors.New("donor is required")
	}
	if strings.TrimSpace(input.RequestID) == "" {
		return 0, false, errors.New("request id is required")
	}
	if err := model.ValidateAmount(input.Amount); err != nil {
		return 0, false, err
	}

	donatedAt, err := parseOccurredAt(input.DonatedAt)
	if err != nil {
		return 0, false, fmt.Errorf("invalid donatedAt: %w", err)
	}

	entryID, reused, err := s.repo.CreateEntryWithRequestID(ctx, repository.CreateLedgerEntryInput{
		UserID:      input.ActorUserID,
		EntryType:   model.LedgerEntryTypeDonation,
		Amount:      strings.TrimSpace(input.Amount),
		OccurredAt:  donatedAt,
		Description: fmt.Sprintf("donor=%s", donor),
	}, strings.TrimSpace(input.RequestID))
	if err != nil {
		return 0, false, err
	}
	return entryID, reused, nil
}

func (s *LedgerService) CreateExpense(ctx context.Context, input ExpenseInput) (uint64, bool, error) {
	purpose := strings.TrimSpace(input.Purpose)
	handledBy := strings.TrimSpace(input.HandledBy)
	if purpose == "" {
		return 0, false, errors.New("purpose is required")
	}
	if handledBy == "" {
		return 0, false, errors.New("handledBy is required")
	}
	if strings.TrimSpace(input.RequestID) == "" {
		return 0, false, errors.New("request id is required")
	}
	if err := model.ValidateAmount(input.Amount); err != nil {
		return 0, false, err
	}

	occurredAt, err := parseOccurredAt(input.OccurredAt)
	if err != nil {
		return 0, false, fmt.Errorf("invalid occurredAt: %w", err)
	}

	entryID, reused, err := s.repo.CreateEntryWithRequestID(ctx, repository.CreateLedgerEntryInput{
		UserID:      input.ActorUserID,
		EntryType:   model.LedgerEntryTypeExpense,
		Amount:      strings.TrimSpace(input.Amount),
		OccurredAt:  occurredAt,
		Description: fmt.Sprintf("purpose=%s;handled_by=%s", purpose, handledBy),
	}, strings.TrimSpace(input.RequestID))
	if err != nil {
		return 0, false, err
	}
	return entryID, reused, nil
}

func (s *LedgerService) UpdateLedgerEntry(ctx context.Context, input UpdateLedgerEntryInput) error {
	if input.EntryID == 0 {
		return errors.New("entry id is required")
	}
	if err := model.ValidateAmount(input.Amount); err != nil {
		return err
	}

	entry, err := s.repo.GetEntryByID(ctx, input.EntryID)
	if err != nil {
		return err
	}

	amount := strings.TrimSpace(input.Amount)

	switch entry.EntryType {
	case model.LedgerEntryTypeDonation:
		donor := strings.TrimSpace(input.Donor)
		if donor == "" {
			return errors.New("donor is required")
		}
		donatedAt, err := parseOccurredAt(input.DonatedAt)
		if err != nil {
			return fmt.Errorf("invalid donatedAt: %w", err)
		}

		return s.repo.UpdateEntry(ctx, repository.UpdateLedgerEntryInput{
			EntryID:     input.EntryID,
			Amount:      amount,
			OccurredAt:  donatedAt,
			Description: fmt.Sprintf("donor=%s", donor),
		})
	case model.LedgerEntryTypeExpense:
		purpose := strings.TrimSpace(input.Purpose)
		handledBy := strings.TrimSpace(input.HandledBy)
		if purpose == "" {
			return errors.New("purpose is required")
		}
		if handledBy == "" {
			return errors.New("handledBy is required")
		}
		occurredAt, err := parseOccurredAt(input.OccurredAt)
		if err != nil {
			return fmt.Errorf("invalid occurredAt: %w", err)
		}

		return s.repo.UpdateEntry(ctx, repository.UpdateLedgerEntryInput{
			EntryID:     input.EntryID,
			Amount:      amount,
			OccurredAt:  occurredAt,
			Description: fmt.Sprintf("purpose=%s;handled_by=%s", purpose, handledBy),
		})
	default:
		return errors.New("invalid entry type")
	}
}

func parseOccurredAt(raw string) (time.Time, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return time.Time{}, errors.New("time value is required")
	}

	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t, nil
	}
	if t, err := time.ParseInLocation("2006-01-02", value, time.FixedZone("CST", 8*3600)); err == nil {
		return t, nil
	}

	return time.Time{}, errors.New("must be RFC3339 or YYYY-MM-DD")
}
