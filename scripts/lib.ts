import type { Client, InStatement } from '@libsql/client'
import { openClient, schemaVersion, versionStatements } from '../src/server/migrations.server.ts'

// Shared by the command-line scripts. They run with plain Node (type
// stripping), so imports name their .ts files and avoid the app's ~/ paths.

export { openClient }

/** Where a client points, for messages: never prints the token. */
export function describeTarget(env: NodeJS.ProcessEnv) {
  if (env.TURSO_DATABASE_URL && !env.DATABASE_PATH) return { remote: true, label: `Turso: ${env.TURSO_DATABASE_URL}` }
  return { remote: false, label: `local file: ${env.DATABASE_PATH || 'data/garage.db'}` }
}

export function hasFlag(name: string) {
  return process.argv.includes(name)
}

/** Value after a flag, e.g. `--to path`. */
export function flagValue(name: string) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

interface SchemaObject { type: string; name: string; sql: string }

async function schemaObjects(db: Client) {
  const rs = await db.execute(
    `SELECT type, name, sql FROM sqlite_schema
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'
     ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`,
  )
  return rs.rows.map((r) => ({ type: String(r[0]), name: String(r[1]), sql: String(r[2]) })) as SchemaObject[]
}

export async function tableCounts(db: Client) {
  const out: Record<string, number> = {}
  for (const o of await schemaObjects(db)) {
    if (o.type !== 'table') continue
    const rs = await db.execute(`SELECT COUNT(*) FROM "${o.name}"`)
    out[o.name] = Number(rs.rows[0]![0])
  }
  return out
}

/**
 * Copies every table, row, index and the schema version from one database
 * into an empty one, in a single transaction with foreign keys off, then
 * checks the foreign keys.
 */
export async function copyDatabase(from: Client, to: Client) {
  if ((await schemaObjects(to)).length) throw new Error('The target database is not empty.')
  const objects = await schemaObjects(from)
  const statements: InStatement[] = objects.filter((o) => o.type === 'table').map((o) => o.sql)
  for (const table of objects.filter((o) => o.type === 'table')) {
    const rs = await from.execute(`SELECT * FROM "${table.name}"`)
    const columns = rs.columns.map((c) => `"${c}"`).join(', ')
    const marks = rs.columns.map(() => '?').join(', ')
    for (const row of rs.rows)
      statements.push({ sql: `INSERT INTO "${table.name}" (${columns}) VALUES (${marks})`, args: rs.columns.map((_, i) => row[i]!) })
  }
  statements.push(...objects.filter((o) => o.type !== 'table').map((o) => o.sql))
  // The schema_version table is copied with the rest; an older source only has PRAGMA user_version.
  const version = await schemaVersion(from)
  if (!objects.some((o) => o.name === 'schema_version')) statements.push(...versionStatements(version))
  await to.migrate(statements)

  const broken = await to.execute('PRAGMA foreign_key_check')
  if (broken.rows.length) throw new Error(`The copy has ${broken.rows.length} broken foreign keys.`)
  if ((await schemaVersion(to)) !== version) throw new Error('The copy has the wrong schema version.')
  const [a, b] = [await tableCounts(from), await tableCounts(to)]
  for (const [name, n] of Object.entries(a))
    if (b[name] !== n) throw new Error(`Row counts differ for ${name}: ${n} in the source, ${b[name]} in the copy.`)
  return { version, counts: a }
}
