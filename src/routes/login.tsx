import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

// Staff sign-in. A plain form post to /api/login, so it works before any
// JavaScript loads; the endpoint sets the session cookie and redirects back.

const searchSchema = z.object({
  next: z.string().optional().catch(undefined),
  error: z.enum(['invalid', 'locked']).optional().catch(undefined),
  email: z.string().max(200).optional().catch(undefined),
})

const messages = {
  invalid: 'That email and password don’t match an account.',
  locked: 'Too many wrong passwords. Try again in 15 minutes.',
} as const

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: 'Sign in · Garage' }, { name: 'robots', content: 'noindex' }] }),
  component: Login,
})

function Login() {
  const { next, error, email } = Route.useSearch()
  return (
    <div className="login">
      <form method="post" action="/api/login" className="panel form stack">
        <h1 className="brand">Garage</h1>
        <p className="muted small">Staff sign-in</p>
        {error && <p role="alert" className="field-error">{messages[error]}</p>}
        <input type="hidden" name="next" value={next ?? '/'} />
        <label>
          Email
          <input type="email" name="email" autoComplete="username" defaultValue={email} required autoFocus={!email} />
        </label>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required autoFocus={!!email} />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </div>
  )
}
