import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function getCurrentMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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
    }
  )
)
