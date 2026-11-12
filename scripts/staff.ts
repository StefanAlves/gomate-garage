import { generatePassword, hashPassword } from '../src/server/password.ts'
import { describeTarget, fail, openClient } from './lib.ts'

// Staff accounts. There's no sign-up page; accounts are made here.
//   npm run staff -- list
//   npm run staff -- add ana@example.com "Ana Lee"   → prints a new password once
//   npm run staff -- reset ana@example.com           → new password, signs them out everywhere
//   npm run staff -- disable ana@example.com         → can't sign in, signed out everywhere
//   npm run staff -- enable ana@example.com

const [command, email, ...nameParts] = process.argv.slice(2)
const db = openClient(process.env)
console.log(describeTarget(process.env).label)

const now = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const find = async (e: string) => (await db.execute({ sql: 'SELECT id FROM staff WHERE email = ?', args: [e] })).rows[0]
const signOutEverywhere = (id: unknown) => db.execute({ sql: 'DELETE FROM sessions WHERE staff_id = ?', args: [id as number] })
const showPassword = (password: string) =>
  console.log(`\nPassword: ${password}\nShare it privately; it isn't shown again.`)

switch (command) {
  case 'list': {
    const rs = await db.execute(`SELECT id, name, email, CASE WHEN disabled_at IS NULL THEN 'active' ELSE 'disabled' END AS status,
      locked_until AS lockedUntil, (SELECT COUNT(*) FROM sessions s WHERE s.staff_id = staff.id) AS sessions FROM staff ORDER BY id`)
    console.table(rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]]))))
    break
  }
  case 'add': {
    const name = nameParts.join(' ').trim()
    if (!email || !email.includes('@') || !name) fail('Usage: npm run staff -- add <email> "<full name>"')
    if (await find(email)) fail(`${email} already has an account.`)
    const password = generatePassword()
    await db.execute({ sql: 'INSERT INTO staff (name, email, password_hash) VALUES (?, ?, ?)', args: [name, email, await hashPassword(password)] })
    console.log(`Added ${name} <${email}>.`)
    showPassword(password)
    break
  }
  case 'reset': {
    const row = email && (await find(email))
    if (!row) fail(`No account for ${email ?? '(missing email)'}.`)
    const password = generatePassword()
    await db.execute({
      sql: `UPDATE staff SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ${now} WHERE id = ?`,
      args: [await hashPassword(password), row.id as number],
    })
    await signOutEverywhere(row.id)
    console.log(`New password for ${email}; their old sessions are signed out.`)
    showPassword(password)
    break
  }
  case 'disable':
  case 'enable': {
    const row = email && (await find(email))
    if (!row) fail(`No account for ${email ?? '(missing email)'}.`)
    await db.execute({
      sql: `UPDATE staff SET disabled_at = ${command === 'disable' ? now : 'NULL'}, updated_at = ${now} WHERE id = ?`,
      args: [row.id as number],
    })
    if (command === 'disable') await signOutEverywhere(row.id)
    console.log(`${email} ${command}d.`)
    break
  }
  default:
    fail('Usage: npm run staff -- list | add <email> "<name>" | reset <email> | disable <email> | enable <email>')
}
