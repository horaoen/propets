import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

export function ProtectedRoute() {
  const tokens = useAuthStore((s) => s.tokens)

  if (!tokens?.accessToken) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function GuestRoute() {
  const tokens = useAuthStore((s) => s.tokens)

  if (tokens?.accessToken) {
    return <Navigate to="/ledger" replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { tokens, getRole } = useAuthStore()

  if (!tokens?.accessToken) {
    return <Navigate to="/login" replace />
  }

  if (getRole() !== 'admin') {
    return <Navigate to="/ledger" replace />
  }

  return <Outlet />
}
