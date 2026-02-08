import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProtectedRoute, GuestRoute, AdminRoute } from '@/components/RouteGuards'
import { LoginPage } from '@/pages/LoginPage'
import { LedgerPage } from '@/pages/LedgerPage'
import { LedgerDetailsPage } from '@/pages/LedgerDetailsPage'
import { AdminLedgerPage } from '@/pages/AdminLedgerPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/ledger/details" element={<LedgerDetailsPage />} />
          </Route>

          <Route element={<AdminRoute />}>
            <Route path="/admin/ledger" element={<AdminLedgerPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/ledger" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
