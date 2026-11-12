import { createFileRoute } from '@tanstack/react-router'
import { SESSION_COOKIE, logout, sessionCookie } from '~/server/auth.server'

// The "Sign out" button posts here: the session is deleted, not just forgotten by the browser.

export const Route = createFileRoute('/api/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get('cookie')?.split(';').map((c) => c.trim())
          .find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)
        await logout(token && decodeURIComponent(token))
        return new Response(null, {
          status: 303,
          headers: { Location: '/login', 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie(request, '', 0) },
        })
      },
    },
  },
})
