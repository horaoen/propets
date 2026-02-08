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

function parseDescriptionFields(description: string): Array<{ key: string; value: string; index: number }> {
  return description
    .trim()
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const [rawKey, ...rest] = part.split('=')
      return {
        key: rawKey?.trim() || '',
        value: rest.join('=').trim(),
        index,
      }
    })
}

function parseDetailDescription(description: string): string {
  const text = description.trim()
  if (!text) return '-'

  const fields = parseDescriptionFields(text)

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
    .filter((field): field is { key: string; value: string; index: number } =>
      Boolean(field.key && field.value)
    )
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

function toDateInputValue(raw: string): string {
  const date = new Date(raw)
  if (isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayDateValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toISOString(value: string): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (isNaN(date.getTime())) return value
  return date.toISOString()
}

export function AdminLedgerPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { tokens, logout, getRole } = useAuthStore()
  const { month, setMonth } = useLedgerStore()

  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | '' }>({ message: '', type: '' })

  const [donationForm, setDonationForm] = useState({ donor: '', donatedAt: getTodayDateValue(), amount: '' })
  const [expenseForm, setExpenseForm] = useState({ purpose: '', handledBy: '', occurredAt: getTodayDateValue(), amount: '' })
  const [editDonationForm, setEditDonationForm] = useState({ donor: '', donatedAt: '', amount: '' })
  const [editExpenseForm, setEditExpenseForm] = useState({ purpose: '', handledBy: '', occurredAt: '', amount: '' })

  const [createDialog, setCreateDialog] = useState<{ open: boolean; type: 'donation' | 'expense' }>({
    open: false,
    type: 'donation',
  })
  const [editDialog, setEditDialog] = useState<{
    open: boolean
    entryId: number | null
    entryType: 'donation' | 'expense' | null
  }>({
    open: false,
    entryId: null,
    entryType: null,
  })

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
      setDonationForm({ donor: '', donatedAt: getTodayDateValue(), amount: '' })
      setCreateDialog((prev) => ({ ...prev, open: false }))
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
      setExpenseForm({ purpose: '', handledBy: '', occurredAt: getTodayDateValue(), amount: '' })
      setCreateDialog((prev) => ({ ...prev, open: false }))
      queryClient.invalidateQueries({ queryKey: ['admin-ledger'] })
    },
    onError: (err) => {
      setStatus({ message: err.message, type: 'error' })
    },
  })

  const updateMutation = useMutation<
    void,
    ApiError,
    {
      entryId: number
      entryType: 'donation' | 'expense'
      donationForm: typeof editDonationForm
      expenseForm: typeof editExpenseForm
    }
  >({
    mutationFn: async ({ entryId, entryType, donationForm, expenseForm }) => {
      if (entryType === 'donation') {
        return apiRequest<void>(`/api/ledger/entries/${entryId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            donor: donationForm.donor,
            donatedAt: toISOString(donationForm.donatedAt),
            amount: donationForm.amount,
          }),
        })
      }

      return apiRequest<void>(`/api/ledger/entries/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          purpose: expenseForm.purpose,
          handledBy: expenseForm.handledBy,
          occurredAt: toISOString(expenseForm.occurredAt),
          amount: expenseForm.amount,
        }),
      })
    },
    onSuccess: () => {
      setStatus({ message: '修改成功', type: 'success' })
      setEditDialog({ open: false, entryId: null, entryType: null })
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

  const handleOpenCreateDialog = (type: 'donation' | 'expense') => {
    setCreateDialog({ open: true, type })
  }

  const handleOpenEditDialog = (item: LedgerEntry) => {
    const fields = parseDescriptionFields(item.description)
    const structuredFields = fields.filter((field) => Boolean(field.key && field.value))
    const fieldMap = new Map(structuredFields.map((field) => [field.key, field.value]))
    const legacyDescription = structuredFields.length === 0 ? item.description.trim() : ''

    if (item.entry_type === 'donation') {
      setEditDonationForm({
        donor: fieldMap.get('donor') || legacyDescription,
        donatedAt: toDateInputValue(item.occurred_at),
        amount: Number(item.amount).toFixed(2),
      })
      setEditDialog({ open: true, entryId: item.id, entryType: 'donation' })
      return
    }

    setEditExpenseForm({
      purpose: fieldMap.get('purpose') || legacyDescription,
      handledBy: fieldMap.get('handled_by') || '',
      occurredAt: toDateInputValue(item.occurred_at),
      amount: Number(item.amount).toFixed(2),
    })
    setEditDialog({ open: true, entryId: item.id, entryType: 'expense' })
  }

  const handleEditDialogClose = (open: boolean) => {
    if (open) {
      setEditDialog((prev) => ({ ...prev, open: true }))
      return
    }
    setEditDialog({ open: false, entryId: null, entryType: null })
  }

  const handleEditSave = () => {
    if (!editDialog.entryId || !editDialog.entryType) {
      setStatus({ message: '未找到可编辑的流水记录', type: 'error' })
      return
    }

    if (editDialog.entryType === 'donation') {
      if (!editDonationForm.donor || !editDonationForm.donatedAt || !editDonationForm.amount) {
        setStatus({ message: '请填写所有必填字段', type: 'error' })
        return
      }
    }

    if (editDialog.entryType === 'expense') {
      if (!editExpenseForm.purpose || !editExpenseForm.handledBy || !editExpenseForm.occurredAt || !editExpenseForm.amount) {
        setStatus({ message: '请填写所有必填字段', type: 'error' })
        return
      }
    }

    updateMutation.mutate({
      entryId: editDialog.entryId,
      entryType: editDialog.entryType,
      donationForm: editDonationForm,
      expenseForm: editExpenseForm,
    })
  }

  const items = data?.items || []

  const isSubmitting =
    donationMutation.isPending || expenseMutation.isPending || updateMutation.isPending || deleteMutation.isPending

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
                className="w-full sm:w-40"
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

          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
            <p className="text-sm font-medium mb-3">新增流水</p>
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1 sm:flex-none" onClick={() => handleOpenCreateDialog('donation')}>
                新增捐款
              </Button>
              <Button className="flex-1 sm:flex-none" variant="secondary" onClick={() => handleOpenCreateDialog('expense')}>
                新增支出
              </Button>
            </div>
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">新增与修改均在弹窗中完成，避免打断列表浏览。</p>
          </div>

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
                    <p className="mt-1 text-sm whitespace-pre-line leading-6">
                      {parseDetailDescription(item.description)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      发生时间：{formatDate(item.occurred_at)}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(item)}>
                        编辑
                      </Button>
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

      <Dialog open={createDialog.open} onOpenChange={(open) => setCreateDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createDialog.type === 'donation' ? '新增捐款' : '新增支出'}</DialogTitle>
            <DialogDescription>
              {createDialog.type === 'donation'
                ? '填写捐款信息后提交，提交成功会自动刷新列表。'
                : '填写支出信息后提交，提交成功会自动刷新列表。'}
            </DialogDescription>
          </DialogHeader>

          {createDialog.type === 'donation' ? (
            <form onSubmit={handleDonationSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="create-donor">捐款人</Label>
                <Input
                  id="create-donor"
                  value={donationForm.donor}
                  onChange={(e) => setDonationForm({ ...donationForm, donor: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-donatedAt">捐款日期</Label>
                <Input
                  id="create-donatedAt"
                  type="date"
                  value={donationForm.donatedAt}
                  onChange={(e) => setDonationForm({ ...donationForm, donatedAt: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-donation-amount">金额</Label>
                <Input
                  id="create-donation-amount"
                  inputMode="decimal"
                  placeholder="100.00"
                  value={donationForm.amount}
                  onChange={(e) => setDonationForm({ ...donationForm, amount: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <DialogFooter>
                <Button variant="secondary" type="button" onClick={() => setCreateDialog((prev) => ({ ...prev, open: false }))}>
                  取消
                </Button>
                <Button type="submit" loading={donationMutation.isPending}>
                  创建捐款
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleExpenseSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="create-purpose">用途</Label>
                <Input
                  id="create-purpose"
                  value={expenseForm.purpose}
                  onChange={(e) => setExpenseForm({ ...expenseForm, purpose: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-handledBy">经手人</Label>
                <Input
                  id="create-handledBy"
                  value={expenseForm.handledBy}
                  onChange={(e) => setExpenseForm({ ...expenseForm, handledBy: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-occurredAt">发生时间</Label>
                <Input
                  id="create-occurredAt"
                  type="date"
                  value={expenseForm.occurredAt}
                  onChange={(e) => setExpenseForm({ ...expenseForm, occurredAt: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-expense-amount">金额</Label>
                <Input
                  id="create-expense-amount"
                  inputMode="decimal"
                  placeholder="80.00"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <DialogFooter>
                <Button variant="secondary" type="button" onClick={() => setCreateDialog((prev) => ({ ...prev, open: false }))}>
                  取消
                </Button>
                <Button type="submit" loading={expenseMutation.isPending}>
                  创建支出
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editDialog.open} onOpenChange={handleEditDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editDialog.entryType === 'donation' ? `编辑捐款 #${editDialog.entryId}` : `编辑支出 #${editDialog.entryId}`}
            </DialogTitle>
            <DialogDescription>修改后保存，将直接更新该条流水并刷新列表。</DialogDescription>
          </DialogHeader>

          {editDialog.entryType === 'donation' ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-donor">捐款人</Label>
                <Input
                  id="edit-donor"
                  value={editDonationForm.donor}
                  onChange={(e) => setEditDonationForm({ ...editDonationForm, donor: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-donatedAt">捐款日期</Label>
                <Input
                  id="edit-donatedAt"
                  type="date"
                  value={editDonationForm.donatedAt}
                  onChange={(e) => setEditDonationForm({ ...editDonationForm, donatedAt: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-donation-amount">金额</Label>
                <Input
                  id="edit-donation-amount"
                  inputMode="decimal"
                  value={editDonationForm.amount}
                  onChange={(e) => setEditDonationForm({ ...editDonationForm, amount: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-purpose">用途</Label>
                <Input
                  id="edit-purpose"
                  value={editExpenseForm.purpose}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, purpose: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-handledBy">经手人</Label>
                <Input
                  id="edit-handledBy"
                  value={editExpenseForm.handledBy}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, handledBy: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-occurredAt">发生时间</Label>
                <Input
                  id="edit-occurredAt"
                  type="date"
                  value={editExpenseForm.occurredAt}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, occurredAt: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-expense-amount">金额</Label>
                <Input
                  id="edit-expense-amount"
                  inputMode="decimal"
                  value={editExpenseForm.amount}
                  onChange={(e) => setEditExpenseForm({ ...editExpenseForm, amount: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setEditDialog({ open: false, entryId: null, entryType: null })}
            >
              关闭
            </Button>
            <Button onClick={handleEditSave} loading={updateMutation.isPending}>
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
