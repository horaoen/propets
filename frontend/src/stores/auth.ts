import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Tokens {
  accessToken: string
  refreshToken: string
}

interface AuthState {
  tokens: Tokens | null
  setTokens: (tokens: Tokens) => void
  logout: () => void
  getRole: () => string
}

function decodeRole(accessToken: string): string {
  try {
    const payloadChunk = accessToken.split('.')[1] || ''
    if (!payloadChunk) return ''
    const normalized = payloadChunk.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded))
    return typeof payload?.role === 'string' ? payload.role : ''
  } catch {
    return ''
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      tokens: null,
      setTokens: (tokens) => set({ tokens }),
      logout: () => set({ tokens: null }),
      getRole: () => {
        const tokens = get().tokens
        if (!tokens?.accessToken) return ''
        return decodeRole(tokens.accessToken)
      },
    }),
    {
      name: 'member_auth_tokens',
    }
  )
)
