import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { SESSION_COOKIE, staffForSession } from './auth.server'

/** Who is signed in, for the top bar. Null on the sign-in page. */
export const getCurrentStaff = createServerFn({ method: 'GET' }).handler(() => staffForSession(getCookie(SESSION_COOKIE)))
