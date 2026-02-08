import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useLedgerStore } from '@/stores/ledger'
import { apiRequest, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface MonthlyStatistic {
  month: string
  donation_total: string
  expense_total: string
  cumulative_balance: string
}

interface MonthlyStatisticsResponse {
  items: MonthlyStatistic[]
}

function formatAmount(raw: string): string {
  return Number(raw).toFixed(2)
}

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function buildMonthlyStatsCsv(items: MonthlyStatistic[]): string {
  const header = ['月份', '捐款', '花费', '总余额(累积)']
  const lines = items.map((item) => [
    item.month,
    formatAmount(item.donation_total),
    formatAmount(item.expense_total),
    formatAmount(item.cumulative_balance),
  ])

  return [header, ...lines].map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n')
}

export function LedgerPage() {
  const navigate = useNavigate()
  const { tokens, logout, getRole } = useAuthStore()
  const { month, setMonth } = useLedgerStore()

  const isAdmin = getRole() === 'admin'
  const hasMonthFilter = month.length > 0

  const {
    data: monthlyStatsData,
    isLoading,
    error,
  } = useQuery<MonthlyStatisticsResponse, ApiError>({
    queryKey: ['ledger-monthly-statistics'],
    queryFn: () => apiRequest<MonthlyStatisticsResponse>('/api/summary/monthly'),
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

  const monthlyStats = monthlyStatsData?.items || []

  const handleExportMonthlyStats = () => {
    if (monthlyStats.length === 0) return

    const csv = buildMonthlyStatsCsv(monthlyStats)
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ledger-monthly-statistics.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const openMonthDetails = (targetMonth: string) => {
    setMonth(targetMonth)
    navigate('/ledger/details')
  }

  return (
    <div className="min-h-screen bg-[var(--muted)] p-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>成员月度统计</CardTitle>
              <CardDescription>点击任意月份可直接查看该月账单明细。</CardDescription>
            </div>
            <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
              {isAdmin && (
                <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => navigate('/admin/ledger')}>
                  前往后台
                </Button>
              )}
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => navigate('/ledger/details')}>
                账单明细
              </Button>
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-[var(--destructive)]">{error.message}</p>}

          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">月度统计</p>
              <Button variant="outline" onClick={handleExportMonthlyStats} disabled={monthlyStats.length === 0}>
                导出 CSV
              </Button>
            </div>
            {isLoading ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">统计加载中...</p>
            ) : monthlyStats.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">暂无统计数据</p>
            ) : (
              <div className="mt-3">
                <div className="hidden sm:block space-y-2">
                  {monthlyStats.map((stat) => (
                    <button
                      key={stat.month}
                      type="button"
                      onClick={() => openMonthDetails(stat.month)}
                      aria-label={`查看 ${stat.month} 账单明细`}
                      className={`w-full rounded-md border border-[var(--border)] p-3 text-left text-sm transition-colors hover:bg-[var(--accent)]/60 ${
                        hasMonthFilter && stat.month === month ? 'bg-[var(--primary)]/10 border-[var(--primary)]/20' : 'bg-[var(--background)]/50'
                      }`}
                    >
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <span className="font-medium">{stat.month}</span>
                        <span>捐: +{formatAmount(stat.donation_total)}</span>
                        <span>支: -{formatAmount(stat.expense_total)}</span>
                        <span className="text-right font-semibold">余额: {formatAmount(stat.cumulative_balance)}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="block sm:hidden space-y-2">
                  {monthlyStats.map((stat) => (
                    <button
                      key={stat.month}
                      type="button"
                      onClick={() => openMonthDetails(stat.month)}
                      aria-label={`查看 ${stat.month} 账单明细`}
                      className={`w-full rounded-md border border-[var(--border)] p-3 text-left text-sm transition-colors hover:bg-[var(--accent)]/60 ${
                        hasMonthFilter && stat.month === month ? 'bg-[var(--primary)]/10 border-[var(--primary)]/20' : 'bg-[var(--background)]/50'
                      }`}
                    >
                      <p className="mb-2 font-medium">{stat.month}</p>
                      <div className="flex justify-between text-[var(--muted-foreground)] text-xs">
                        <span>捐: +{formatAmount(stat.donation_total)}</span>
                        <span>支: -{formatAmount(stat.expense_total)}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold">余额: {formatAmount(stat.cumulative_balance)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
