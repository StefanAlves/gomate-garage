import { existsSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { copyDatabase, describeTarget, fail, flagValue, hasFlag, openClient, tableCounts } from './lib.ts'

// One-off move of the live data into Turso (SPECs/deployment.md):
//   npm run import -- --from data/garage.db --yes
// The Turso database must be empty. Stop the dev server first, so the file
// isn't changing while it's copied.

const from = flagValue('--from') ?? 'data/garage.db'
if (!existsSync(from)) fail(`No such file: ${from}`)
const target = describeTarget(process.env)
if (!target.remote) fail('TURSO_DATABASE_URL is not set (and DATABASE_PATH must not be).')

console.log(`Copying ${from}\n  → ${target.label}`)
if (!hasFlag('--yes')) fail('\nRe-run with --yes to copy.')
const source = createClient({ url: `file:${from}` })
await source.execute('PRAGMA wal_checkpoint(TRUNCATE)')
const { version, counts } = await copyDatabase(source, openClient(process.env))
console.log(`Done: schema version ${version}.`)
console.table(await tableCounts(openClient(process.env)))
console.log(Object.keys(counts).length, 'tables copied; row counts match the source.')
