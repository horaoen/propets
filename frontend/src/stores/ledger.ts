import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LedgerState {
  month: string
  page: number
  pageSize: number
  totalPages: number
  setMonth: (month: string) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  setTotalPages: (totalPages: number) => void
  resetPagination: () => void
}

export const useLedgerStore = create<LedgerState>()(
  persist(
    (set) => ({
      month: '',
      page: 1,
      pageSize: 10,
      totalPages: 1,
      setMonth: (month) => set({ month, page: 1 }),
      setPage: (page) => set({ page }),
      setPageSize: (pageSize) => set({ pageSize, page: 1 }),
      setTotalPages: (totalPages) => set({ totalPages }),
      resetPagination: () => set({ page: 1, totalPages: 1 }),
    }),
    {
      name: 'propets_ledger_prefs',
      partialize: (state) => ({ month: state.month }),
    }
  )
)
