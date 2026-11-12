import '@tanstack/react-start/server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { InValue, ResultSet, Transaction } from '@libsql/client'
import { checkSchema, openClient, sqlNow } from './migrations.server'

// The app's one database handle. Server-only: the build fails if any client
// code imports this module.
//
// libSQL (SQLite) through @libsql/client: a local file when DATABASE_PATH is
// set (`npm run dev` sets data/garage.db), otherwise Turso (Vercel). Tests use
// DATABASE_PATH=:memory:, the only case where migrations run on their own;
// everywhere else run `npm run migrate` (after a backup).

const client = openClient(process.env)
const memory = process.env.DATABASE_PATH === ':memory:'

/** Resolves once the schema is known to be current; checked once per server process. */
let ready: Promise<void> | undefined
const schemaReady = () => (ready ??= checkSchema(client, { migrate: memory }).catch((err) => {
  ready = undefined // try again on the next request
  throw err
}))

/** The open transaction for this async call chain, if any. */
const currentTx = new AsyncLocalStorage<Transaction>()

export type Args = readonly InValue[] | Record<string, InValue>

/** Plain objects keyed by column name, so rows serialize like any other value. */
function rowsOf<T>(rs: ResultSet): T[] {
  return rs.rows.map((row) => {
    const out: Record<string, unknown> = {}
    rs.columns.forEach((c, i) => (out[c] = row[i]))
    return out as T
  })
}

/**
 * A named parameter missing from `args` crashes the libSQL driver instead of
 * throwing, so check for it here.
 */
function checkNamedArgs(sql: string, args: Args | undefined) {
  if (!args || Array.isArray(args)) return
  for (const [, name] of sql.matchAll(/(?<![:\w]):([A-Za-z_]\w*)/g)) {
    if (!(name! in (args as Record<string, InValue>))) throw new Error(`Missing SQL parameter :${name}`)
  }
}

async function execute(sql: string, args?: Args) {
  await schemaReady()
  checkNamedArgs(sql, args)
  // Inside inTransaction(), every query goes through that transaction.
  const target = currentTx.getStore() ?? client
  return target.execute({ sql, args: (args ?? []) as InValue[] })
}

export const db = {
  async all<T = Record<string, unknown>>(sql: string, args?: Args): Promise<T[]> {
    return rowsOf<T>(await execute(sql, args))
  },
  async get<T = Record<string, unknown>>(sql: string, args?: Args): Promise<T | undefined> {
    return rowsOf<T>(await execute(sql, args))[0]
  },
  async run(sql: string, args?: Args) {
    const rs = await execute(sql, args)
    return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) }
  },
  /** Several statements with no parameters (tests and scripts). Not inside a transaction. */
  async exec(sql: string) {
    if (currentTx.getStore()) throw new Error('db.exec() cannot run inside inTransaction()')
    await schemaReady()
    await client.executeMultiple(sql)
  },
}

/**
 * Runs `fn` in a write transaction: committed if it resolves, rolled back if it
 * throws. Every `db` call made inside `fn` (however deep) joins the
 * transaction; a nested inTransaction() simply runs inside the outer one.
 */
export async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (currentTx.getStore()) return fn()
  await schemaReady()
  const tx = await client.transaction('write')
  try {
    const out = await currentTx.run(tx, fn)
    await tx.commit()
    return out
  } catch (err) {
    await tx.rollback().catch(() => {})
    throw err
  } finally {
    tx.close()
  }
}

/** Cents from a dollar amount validated by the shared schemas. */
export const toCents = (dollars: number | null) => (dollars == null ? null : Math.round(dollars * 100))

export { sqlNow }

/** True when a write failed on a UNIQUE constraint for `table.column`. */
export function isUniqueViolation(err: unknown, column: string) {
  return err instanceof Error && /UNIQUE constraint failed/.test(err.message) && err.message.includes(column)
}

export function isForeignKeyViolation(err: unknown) {
  return err instanceof Error && /FOREIGN KEY constraint failed/.test(err.message)
}

/** SQL LIKE pattern for a free-text search, with wildcards escaped (use ESCAPE '\\'). */
export function likePattern(q: string | undefined) {
  return q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : null
}
