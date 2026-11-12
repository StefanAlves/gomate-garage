import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { SESSION_COOKIE, staffForSession } from '~/server/auth.server'

// App-wide Start config. Every route is fully server-rendered unless it opts
// out with its own `ssr` option.

/** Server functions and form posts must come from this site (blocks cross-site requests). */
const csrf = createCsrfMiddleware({
  filter: ({ handlerType, request }) => handlerType === 'serverFn' || request.method !== 'GET',
})

/** Pages and endpoints anyone may reach: the sign-in page and its form post. */
const PUBLIC_PATHS = new Set(['/login', '/api/login'])

function cookieValue(request: Request, name: string) {
  for (const part of request.headers.get('cookie')?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

/**
 * Staff only. Every page, server function and API route (ID photos included)
 * needs a valid session; without one, pages redirect to /login and everything
 * else gets a 401.
 */
const requireStaff = createMiddleware().server(async ({ request, pathname, handlerType, next }) => {
  if (PUBLIC_PATHS.has(pathname)) return next()
  const staff = await staffForSession(cookieValue(request, SESSION_COOKIE))
  if (staff) return next({ context: { staff } })
  if (handlerType === 'router' && request.method === 'GET' && !pathname.startsWith('/api/')) {
    const url = new URL(request.url)
    const login = `/login?next=${encodeURIComponent(url.pathname + url.search)}`
    throw new Response(null, { status: 303, headers: { Location: login, 'Cache-Control': 'no-store' } })
  }
  // Start keeps the response status it is tracking, so set it as well as the Response's.
  setResponseStatus(401)
  throw new Response('Sign in required', { status: 401, headers: { 'Cache-Control': 'no-store' } })
})

export const startInstance = createStart(() => ({
  defaultSsr: true,
  requestMiddleware: [csrf, requireStaff],
}))
