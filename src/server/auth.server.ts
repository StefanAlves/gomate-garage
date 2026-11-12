import '@tanstack/react-start/server-only'
import { createHash, randomBytes } from 'node:crypto'
import { db, sqlNow } from './db.server'
import { hashPassword, verifyPassword } from './password'

// Staff sign-in (SPECs/deployment.md). Sessions live in the database so a
// sign-out, a disabled account or a password reset takes effect at once.

export interface Staff {
  id: number
  name: string
  email: string
}

export const SESSION_COOKIE = 'garage_session'
export const SESSION_DAYS = 30
const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex')
const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString()

/** A hash to check against when the email is unknown, so both cases take as long. */
let dummyHash: Promise<string> | undefined

export type LoginOutcome =
  | { ok: true; token: string; staff: Staff }
  | { ok: false; reason: 'invalid' | 'locked' }

/**
 * Checks an email and password. Five wrong passwords in a row lock the
 * account for 15 minutes; a correct one resets the count. Unknown emails,
 * disabled accounts and wrong passwords all look the same to the caller.
 */
export async function login(email: string, password: string): Promise<LoginOutcome> {
  const row = await db.get<Staff & { passwordHash: string; failedLogins: number; lockedUntil: string | null; disabledAt: string | null }>(
    `SELECT id, name, email, password_hash AS passwordHash, failed_logins AS failedLogins,
       locked_until AS lockedUntil, disabled_at AS disabledAt
     FROM staff WHERE email = ?`, [email.trim()],
  )
  if (!row || row.disabledAt) {
    await verifyPassword(password, await (dummyHash ??= hashPassword('not a real password')))
    return { ok: false, reason: 'invalid' }
  }
  if (row.lockedUntil && row.lockedUntil > new Date().toISOString()) return { ok: false, reason: 'locked' }

  if (!(await verifyPassword(password, row.passwordHash))) {
    const failed = row.failedLogins + 1
    const lock = failed >= MAX_FAILED_LOGINS
    await db.run(
      `UPDATE staff SET failed_logins = ?, locked_until = ?, updated_at = ${sqlNow} WHERE id = ?`,
      [lock ? 0 : failed, lock ? inFuture(LOCK_MINUTES * 60_000) : null, row.id],
    )
    return { ok: false, reason: lock ? 'locked' : 'invalid' }
  }

  if (row.failedLogins || row.lockedUntil)
    await db.run(`UPDATE staff SET failed_logins = 0, locked_until = NULL, updated_at = ${sqlNow} WHERE id = ?`, [row.id])
  const token = randomBytes(32).toString('base64url')
  await db.run(`INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?, ?, ?)`,
    [sha256(token), row.id, inFuture(SESSION_DAYS * 86_400_000)])
  // Tidy up expired sessions now and then.
  await db.run(`DELETE FROM sessions WHERE expires_at < ?`, [new Date().toISOString()])
  return { ok: true, token, staff: { id: row.id, name: row.name, email: row.email } }
}

/** The signed-in staff member for a session cookie, or null. */
export async function staffForSession(token: string | undefined): Promise<Staff | null> {
  if (!token) return null
  const row = await db.get<Staff>(
    `SELECT s.id, s.name, s.email FROM sessions x JOIN staff s ON s.id = x.staff_id
     WHERE x.token_hash = ? AND x.expires_at > ? AND s.disabled_at IS NULL`,
    [sha256(token), new Date().toISOString()],
  )
  return row ?? null
}

export async function logout(token: string | undefined) {
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)])
}

/** Only same-site paths, so a crafted link can't send staff elsewhere after signing in. */
export function safeNext(next: unknown) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}

/**
 * The Set-Cookie value for a session (or, with maxAge 0, for clearing it).
 * httpOnly so page scripts can't read it; Secure whenever served over HTTPS;
 * SameSite=Lax so other sites can't post forms with it.
 */
export function sessionCookie(request: Request, value: string, maxAgeSeconds: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
}
