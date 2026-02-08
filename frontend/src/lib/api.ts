import { useAuthStore } from '@/stores/auth'

const API_BASE = ''

export interface ApiError {
  message: string
  status: number
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const tokens = useAuthStore.getState().tokens

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (tokens?.accessToken) {
    ;(headers as Record<string, string>)['Authorization'] = `Bearer ${tokens.accessToken}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  })

  if (response.status === 401) {
    useAuthStore.getState().logout()
    throw { message: '登录已过期，请重新登录', status: 401 } satisfies ApiError
  }

  if (response.status === 403) {
    throw { message: '无权限执行此操作', status: 403 } satisfies ApiError
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw {
      message: errorData.error || '请求失败',
      status: response.status,
    } satisfies ApiError
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

export function buildEntriesQuery({
  month,
  page,
  pageSize,
}: {
  month: string
  page: number
  pageSize: number
}): string {
  const params = new URLSearchParams()
  if (month) {
    params.set('month', month)
  }
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  return params.toString()
}

export function generateRequestId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
