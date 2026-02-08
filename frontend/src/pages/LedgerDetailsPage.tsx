import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useLedgerStore } from '@/stores/ledger'
import { apiRequest, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface LedgerEntry {
  id: number
  entry_type: 'donation' | 'expense'
  amount: string
  description: string
  occurred_at: string
}

interface LedgerResponse {
  items: LedgerEntry[]
  total: number
}

function mapTypeLabel(type: string): string {
  switch (type) {
    case 'donation':
      return '捐款'
    case 'expense':
      return '支出'
    default:
      return '流水'
  }
}

function formatDate(raw: string): string {
  const date = new Date(raw)
  if (isNaN(date.getTime())) return raw || '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatAmount(raw: string): string {
  return Number(raw).toFixed(2)
}

function getCurrentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function parseDetailDescription(description: string): string {
  const text = description.trim()
  if (!text) return '-'

  const fields = text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [rawKey, ...rest] = part.split('=')
      return {
        key: rawKey?.trim(),
        value: rest.join('=').trim(),
        index,
      }
    })

  if (fields.length === 0) return text

  const labelMap: Record<string, string> = {
    donor: '捐款人',
    purpose: '用途',
    handled_by: '经手人',
  }

  const getFieldOrder = (key: string): number => {
    switch (key) {
      case 'donor':
        return 0
      case 'purpose':
        return 1
      case 'handled_by':
        return 2
      default:
        return 100
    }
  }

  const localized = fields
    .filter((field): field is { key: string; value: string; index: number } => Boolean(field.key && field.value))
    .sort((a, b) => {
      const orderDiff = getFieldOrder(a.key) - getFieldOrder(b.key)
      if (orderDiff !== 0) return orderDiff
      return a.index - b.index
    })
    .map((field) => {
      const label = labelMap[field.key] || field.key
      return `${label}：${field.value}`
    })

  return localized.length > 0 ? localized.join('\n') : text
}

export function LedgerDetailsPage() {
  const navigate = useNavigate()
  const { tokens, logout, getRole } = useAuthStore()
  const { month, setMonth } = useLedgerStore()

  const isAdmin = getRole() === 'admin'
  const hasMonthFilter = month.length > 0

  const { data, isLoading, error } = useQuery<LedgerResponse, ApiError>({
    queryKey: ['ledger-details', month],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (month) {
        params.set('month', month)
      }
      params.set('pageSize', '100')
      return apiRequest<LedgerResponse>(`/api/ledger/entries?${params.toString()}`)
    },
    enabled: !!tokens?.accessToken,
  })

  const handleLogout = async () => {
    if (tokens?.refreshToken) {
      try {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        })
      } catch {
        // Ignore logout errors
      }
    }
    logout()
    navigate('/login', { replace: true })
  }

  const items = data?.items || []

  return (
    <div className="min-h-screen bg-[var(--muted)] p-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>账单明细</CardTitle>
              <CardDescription>默认显示当月记录，可切换月份查看具体流水。</CardDescription>
            </div>
            <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
              {isAdmin && (
                <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => navigate('/admin/ledger')}>
                  前往后台
                </Button>
              )}
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => navigate('/ledger')}>
                月度统计
              </Button>
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <Label htmlFor="month-filter">查看月份</Label>
                <Input
                  id="month-filter"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full sm:w-44"
                />
              </div>
              <div className="flex gap-2">
                {hasMonthFilter && (
                  <Button variant="ghost" onClick={() => setMonth('')}>
                    查看全部
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setMonth(getCurrentMonth())}>
                  回到本月
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-[var(--destructive)]">{error.message}</p>}

          <p className="text-sm text-[var(--muted-foreground)]">{month ? `${month} 的账单明细` : '全部账单明细'}，共 {data?.total || 0} 条</p>

          {isLoading ? (
            <div className="py-8 text-center text-[var(--muted-foreground)]">加载中...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-[var(--muted-foreground)]">暂无记录</div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-[var(--muted-foreground)]">{mapTypeLabel(item.entry_type)}</span>
                    <span className="font-semibold">{formatAmount(item.amount)}</span>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-line leading-6">{parseDetailDescription(item.description)}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">发生时间：{formatDate(item.occurred_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
