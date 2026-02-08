package model

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

type LedgerEntryType string

const (
	LedgerEntryTypeDonation LedgerEntryType = "donation"
	LedgerEntryTypeExpense  LedgerEntryType = "expense"
)

type LedgerEntry struct {
	ID          uint64
	UserID      uint64
	EntryType   LedgerEntryType
	Amount      string
	OccurredAt  time.Time
	Description string
	MonthKey    string
	CreatedAt   time.Time
}

func ValidateAmount(raw string) error {
	amount := strings.TrimSpace(raw)
	if amount == "" {
		return fmt.Errorf("amount is required")
	}

	parsed, err := strconv.ParseFloat(amount, 64)
	if err != nil {
		return fmt.Errorf("amount must be a valid decimal")
	}
	if parsed <= 0 {
		return fmt.Errorf("amount must be greater than 0")
	}

	parts := strings.Split(amount, ".")
	if len(parts) == 2 && len(parts[1]) > 2 {
		return fmt.Errorf("amount must have at most 2 decimal places")
	}

	return nil
}
