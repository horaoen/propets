import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useLedgerStore } from '@/stores/ledger'
import { apiRequest, generateRequestId, type ApiError } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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

interface EntryResponse {
  entryId: number
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

function toISOString(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toISOString()
}

export function AdminLedgerPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { tokens, logout, getRole } = useAuthStore()
  const { month, setMonth } = useLedgerStore()

  const [activeTab, setActiveTab] = useState('donations')
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | '' }>({ message: '', type: '' })

  const [donationForm, setDonationForm] = useState({ donor: '', donatedAt: '', amount: '' })
  const [expenseForm, setExpenseForm] = useState({ purpose: '', handledBy: '', occurredAt: '', amount: '' })

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; entryId: number | null }>({
    open: false,
    entryId: null,
  })

  const isAdmin = getRole() === 'admin'

  useEffect(() => {
    if (!isAdmin && tokens?.accessToken) {
      navigate('/ledger', { replace: true })
    }
  }, [isAdmin, tokens, navigate])

  const { data, isLoading, error } = useQuery<LedgerResponse, ApiError>({
    queryKey: ['admin-ledger', month],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (month) {
        params.set('month', month)
      }
      params.set('pageSize', '100')
      return apiRequest<LedgerResponse>(`/api/ledger/entries?${params.toString()}`)
    },
    enabled: !!tokens?.accessToken && isAdmin,
  })

  const donationMutation = useMutation<EntryResponse, ApiError, typeof donationForm>({
    mutationFn: async (form) => {
      return apiRequest<EntryResponse>('/api/ledger/donations', {
        method: 'POST',
        body: JSON.stringify({
          donor: form.donor,
          donatedAt: toISOString(form.donatedAt),
          amount: form.amount,
          requestId: generateRequestId('/api/ledger/donations'),
        }),
      })
    },
    onSuccess: (result) => {
      setStatus({ message: `创建成功，流水 ID：${result.entryId}`, type: 'success' })
      setDonationForm({ donor: '', donatedAt: '', amount: '' })
      queryClient.invalidateQueries({ queryKey: ['admin-ledger'] })
    },
    onError: (err) => {
      setStatus({ message: err.message, type: 'error' })
    },
  })

  const expenseMutation = useMutation<EntryResponse, ApiError, typeof expenseForm>({
    mutationFn: async (form) => {
      return apiRequest<EntryResponse>('/api/ledger/expenses', {
        method: 'POST',
        body: JSON.stringify({
          purpose: form.purpose,
          handledBy: form.handledBy,
          occurredAt: toISOString(form.occurredAt),
          amount: form.amount,
          requestId: generateRequestId('/api/ledger/expenses'),
        }),
      })
    },
    onSuccess: (result) => {
      setStatus({ message: `创建成功，流水 ID：${result.entryId}`, type: 'success' })
      setExpenseForm({ purpose: '', handledBy: '', occurredAt: '', amount: '' })
      queryClient.invalidateQueries({ queryKey: ['admin-ledger'] })
    },
    onError: (err) => {
      setStatus({ message: err.message, type: 'error' })
    },
  })

  const deleteMutation = useMutation<void, ApiError, number>({
    mutationFn: async (entryId) => {
      return apiRequest<void>(`/api/ledger/entries/${entryId}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      setStatus({ message: '删除成功', type: 'success' })
      setDeleteDialog({ open: false, entryId: null })
      queryClient.invalidateQueries({ queryKey: ['admin-ledger'] })
    },
    onError: (err) => {
      setStatus({ message: err.message, type: 'error' })
    },
  })

  const handleLogout = async () => {
    if (tokens?.refreshToken) {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => {})
    }
    logout()
    navigate('/login', { replace: true })
  }

  const handleDonationSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!donationForm.donor || !donationForm.donatedAt || !donationForm.amount) {
      setStatus({ message: '请填写所有必填字段', type: 'error' })
      return
    }
    donationMutation.mutate(donationForm)
  }

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.purpose || !expenseForm.handledBy || !expenseForm.occurredAt || !expenseForm.amount) {
      setStatus({ message: '请填写所有必填字段', type: 'error' })
      return
    }
    expenseMutation.mutate(expenseForm)
  }

  const handleDelete = () => {
    if (!deleteDialog.entryId) return
    deleteMutation.mutate(deleteDialog.entryId)
  }

  const items = data?.items || []

  const isSubmitting = donationMutation.isPending || expenseMutation.isPending || deleteMutation.isPending

  return (
    <div className="min-h-screen bg-[var(--muted)] p-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>管理员后台记账</CardTitle>
          <CardDescription>可创建捐款、支出；提交后自动刷新流水。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="admin-month-filter">月份筛选</Label>
              <Input
                id="admin-month-filter"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={() => navigate('/ledger')}>
                成员公示页
              </Button>
              <Button variant="secondary" onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          </div>

          {status.message && (
            <p className={`text-sm ${status.type === 'error' ? 'text-[var(--destructive)]' : 'text-green-600'}`}>
              {status.message}
            </p>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="donations">新增捐款</TabsTrigger>
              <TabsTrigger value="expenses">新增支出</TabsTrigger>
            </TabsList>

            <TabsContent value="donations">
              <form onSubmit={handleDonationSubmit} className="space-y-4 p-4 border rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="donor">捐款人</Label>
                    <Input
                      id="donor"
                      value={donationForm.donor}
                      onChange={(e) => setDonationForm({ ...donationForm, donor: e.target.value })}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="donatedAt">捐款时间</Label>
                    <Input
                      id="donatedAt"
                      type="datetime-local"
                      value={donationForm.donatedAt}
                      onChange={(e) => setDonationForm({ ...donationForm, donatedAt: e.target.value })}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="donation-amount">金额</Label>
                    <Input
                      id="donation-amount"
                      inputMode="decimal"
                      placeholder="100.00"
                      value={donationForm.amount}
                      onChange={(e) => setDonationForm({ ...donationForm, amount: e.target.value })}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" loading={donationMutation.isPending}>
                  创建捐款
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="expenses">
              <form onSubmit={handleExpenseSubmit} className="space-y-4 p-4 border rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="purpose">用途</Label>
                    <Input
                      id="purpose"
                      value={expenseForm.purpose}
                      onChange={(e) => setExpenseForm({ ...expenseForm, purpose: e.target.value })}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="handledBy">经手人</Label>
                    <Input
                      id="handledBy"
                      value={expenseForm.handledBy}
                      onChange={(e) => setExpenseForm({ ...expenseForm, handledBy: e.target.value })}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="occurredAt">发生时间</Label>
                    <Input
                      id="occurredAt"
                      type="datetime-local"
                      value={expenseForm.occurredAt}
                      onChange={(e) => setExpenseForm({ ...expenseForm, occurredAt: e.target.value })}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="expense-amount">金额</Label>
                    <Input
                      id="expense-amount"
                      inputMode="decimal"
                      placeholder="80.00"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" loading={expenseMutation.isPending}>
                  创建支出
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="pt-4 border-t">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              {month ? `${month} 的后台流水` : '全部历史记录'}，共 {data?.total || 0} 条
            </p>

            {error && <p className="text-sm text-[var(--destructive)] mb-4">{error.message}</p>}

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
                        #{item.id} · {mapTypeLabel(item.entry_type)}
                      </span>
                      <span className="font-semibold">{Number(item.amount).toFixed(2)}</span>
                    </div>
                    <p className="mt-1 text-sm">{item.description || '-'}</p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      发生时间：{formatDate(item.occurred_at)}
                    </p>
                    <div className="mt-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDeleteDialog({ open: true, entryId: item.id })}
                      >
                        删除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除流水 #{deleteDialog.entryId} 吗？此操作不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialog({ open: false, entryId: null })}>
              取消
            </Button>
            <Button onClick={handleDelete} loading={deleteMutation.isPending}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
