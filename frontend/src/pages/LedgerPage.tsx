import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useLedgerStore } from '@/stores/ledger'
import { apiRequest, type ApiError } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
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

export function LedgerPage() {
  const navigate = useNavigate()
  const { tokens, logout, getRole } = useAuthStore()
  const { month, setMonth } = useLedgerStore()

  const isAdmin = getRole() === 'admin'

  const { data, isLoading, error } = useQuery<LedgerResponse, ApiError>({
    queryKey: ['ledger', month],
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
        <CardHeader>
          <CardTitle>成员公示流水</CardTitle>
          <CardDescription>默认显示当月记录，支持按月筛选查看。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="month-filter">月份筛选</Label>
              <Input
                id="month-filter"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              {isAdmin && (
                <Button variant="secondary" onClick={() => navigate('/admin/ledger')}>
                  后台记账
                </Button>
              )}
              <Button variant="secondary" onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-[var(--destructive)]">{error.message}</p>}

          <p className="text-sm text-[var(--muted-foreground)]">
            {month ? `${month} 的公示记录` : '全部历史记录'}，共 {data?.total || 0} 条
          </p>

          {isLoading ? (
            <div className="py-8 text-center text-[var(--muted-foreground)]">加载中...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-[var(--muted-foreground)]">暂无记录</div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-[var(--muted-foreground)]">
                      {mapTypeLabel(item.entry_type)}
                    </span>
                    <span className="font-semibold">
                      {Number(item.amount).toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{item.description || '-'}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    发生时间：{formatDate(item.occurred_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
