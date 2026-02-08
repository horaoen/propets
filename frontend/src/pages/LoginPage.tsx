import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { apiRequest, type ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthResponse {
  accessToken: string
  refreshToken: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const handleSubmit = async (mode: 'login' | 'register') => {
    if (!phone.trim() || !password.trim()) {
      setError('请填写手机号和密码')
      return
    }

    setLoading(true)
    setError('')
    setStatus(mode === 'register' ? '正在注册...' : '正在登录...')

    try {
      if (mode === 'register') {
        try {
          await apiRequest('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ phone: phone.trim(), password: password.trim() }),
          })
        } catch (e) {
          const err = e as ApiError
          if (err.status !== 409) {
            throw e
          }
        }
      }

      const tokens = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), password: password.trim() }),
      })

      setTokens(tokens)
      setStatus('登录成功，正在进入公示页...')
      navigate('/ledger', { replace: true })
    } catch (e) {
      const err = e as ApiError
      setError(err.message || '请求失败')
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--muted)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">宠物救助公示</CardTitle>
          <CardDescription>成员端登录后可查看全部历史流水，并按月筛选。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit('login')
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
            {status && !error && <p className="text-sm text-[var(--muted-foreground)]">{status}</p>}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" loading={loading}>
                登录
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                loading={loading}
                onClick={() => handleSubmit('register')}
              >
                注册并登录
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
