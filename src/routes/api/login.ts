import { createFileRoute } from '@tanstack/react-router'
import { SESSION_DAYS, login, safeNext, sessionCookie } from '~/server/auth.server'

// The sign-in form posts here. On success: session cookie, then back to where
// staff were going. On failure: back to /login with a generic message.

const redirect = (location: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } })

export const Route = createFileRoute('/api/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData().catch(() => null)
        const email = String(form?.get('email') ?? '').slice(0, 200)
        const password = String(form?.get('password') ?? '').slice(0, 1000)
        const next = safeNext(form?.get('next'))
        const out = email && password ? await login(email, password) : ({ ok: false, reason: 'invalid' } as const)
        if (!out.ok) {
          const back = new URLSearchParams({ error: out.reason, email, next })
          return redirect(`/login?${back}`)
        }
        return redirect(next, { 'Set-Cookie': sessionCookie(request, out.token, SESSION_DAYS * 86_400) })
      },
    },
  },
})
