import '@tanstack/react-start/server-only'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migrate, sqlNow } from './migrations.server'

// Single SQLite connection for the server process. Server-only: the build
// fails if any client code imports this module.

// DATABASE_PATH=:memory: gives tests a throwaway database.
const path = process.env.DATABASE_PATH ?? 'data/garage.db'
const file = path === ':memory:' ? path : resolve(path)
if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })

export const db = new DatabaseSync(file)
db.exec(`PRAGMA journal_mode = WAL;`)

/** Cents from a dollar amount validated by the shared schemas. */
export const toCents = (dollars: number | null) => (dollars == null ? null : Math.round(dollars * 100))

export { sqlNow }

migrate(db)

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
