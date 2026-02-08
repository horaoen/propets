import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function getCurrentMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function normalizePersistedMonth(month: unknown): string {
  if (typeof month !== 'string') {
    return getCurrentMonth()
  }

  const normalized = month.trim()
  if (!YEAR_MONTH_PATTERN.test(normalized)) {
    return getCurrentMonth()
  }

  return normalized
}

interface LedgerState {
  month: string
  setMonth: (month: string) => void
}

export const useLedgerStore = create<LedgerState>()(
  persist(
    (set) => ({
      month: getCurrentMonth(),
      setMonth: (month) => set({ month }),
    }),
    {
      name: 'propets_ledger_prefs',
      partialize: (state) => ({ month: state.month }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<LedgerState>
        return {
          ...currentState,
          month: normalizePersistedMonth(persisted.month),
        }
      },
    }
  )
)
