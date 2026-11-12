import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db.server'
import { login, logout, safeNext, staffForSession } from './auth.server'
import { generatePassword, hashPassword, verifyPassword } from './password'

const PASSWORD = 'correct horse battery'

async function addStaff(email = 'ana@example.com', password = PASSWORD) {
  const { lastInsertRowid } = await db.run('INSERT INTO staff (name, email, password_hash) VALUES (?, ?, ?)',
    ['Ana Lee', email, await hashPassword(password)])
  return lastInsertRowid
}

beforeEach(async () => {
  await db.exec('DELETE FROM sessions; DELETE FROM staff')
})

describe('passwords', () => {
  it('verifies only the right password, and salts every hash', async () => {
    const a = await hashPassword(PASSWORD)
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/)
    expect(await verifyPassword(PASSWORD, a)).toBe(true)
    expect(await verifyPassword('wrong', a)).toBe(false)
    expect(await hashPassword(PASSWORD)).not.toBe(a)
    expect(await verifyPassword(PASSWORD, 'garbage')).toBe(false)
  })

  it('generates long random passwords', () => {
    const p = generatePassword()
    expect(p.length).toBeGreaterThanOrEqual(20)
    expect(generatePassword()).not.toBe(p)
  })
})

describe('signing in', () => {
  it('starts a session for the right email and password (email is case-insensitive)', async () => {
    const id = await addStaff()
    const out = await login(' ANA@example.com ', PASSWORD)
    if (!out.ok) throw new Error(out.reason)
    expect(await staffForSession(out.token)).toEqual({ id, name: 'Ana Lee', email: 'ana@example.com' })
    // Only a hash of the token is stored.
    expect(await db.get('SELECT 1 FROM sessions WHERE token_hash = ?', [out.token])).toBeUndefined()
  })

  it('gives the same answer for an unknown email and a wrong password', async () => {
    await addStaff()
    expect(await login('ana@example.com', 'nope')).toEqual({ ok: false, reason: 'invalid' })
    expect(await login('bo@example.com', PASSWORD)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('locks the account after five wrong passwords in a row', async () => {
    await addStaff()
    for (let i = 0; i < 4; i++) expect(await login('ana@example.com', 'nope')).toEqual({ ok: false, reason: 'invalid' })
    expect(await login('ana@example.com', 'nope')).toEqual({ ok: false, reason: 'locked' })
    // Even the right password is refused while locked.
    expect(await login('ana@example.com', PASSWORD)).toEqual({ ok: false, reason: 'locked' })
    await db.run(`UPDATE staff SET locked_until = '2000-01-01T00:00:00.000Z'`)
    expect((await login('ana@example.com', PASSWORD)).ok).toBe(true)
  })

  it('resets the count after a successful sign-in', async () => {
    await addStaff()
    for (let i = 0; i < 4; i++) await login('ana@example.com', 'nope')
    expect((await login('ana@example.com', PASSWORD)).ok).toBe(true)
    expect(await login('ana@example.com', 'nope')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses a disabled account', async () => {
    await addStaff()
    await db.run(`UPDATE staff SET disabled_at = '2026-01-01T00:00:00.000Z'`)
    expect(await login('ana@example.com', PASSWORD)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('sessions', () => {
  it('ends on sign-out, on expiry and when the account is disabled', async () => {
    await addStaff()
    const signIn = async () => {
      const out = await login('ana@example.com', PASSWORD)
      if (!out.ok) throw new Error(out.reason)
      return out.token
    }
    const a = await signIn()
    await logout(a)
    expect(await staffForSession(a)).toBeNull()

    const b = await signIn()
    await db.run(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'`)
    expect(await staffForSession(b)).toBeNull()

    const c = await signIn()
    await db.run(`UPDATE staff SET disabled_at = '2026-01-01T00:00:00.000Z'`)
    expect(await staffForSession(c)).toBeNull()

    expect(await staffForSession(undefined)).toBeNull()
    expect(await staffForSession('made-up')).toBeNull()
  })
})

describe('redirect after sign-in', () => {
  it('only goes to paths on this site', () => {
    expect(safeNext('/cars/1?tab=money')).toBe('/cars/1?tab=money')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/\\evil.example')).toBe('/')
    expect(safeNext(null)).toBe('/')
  })
})
