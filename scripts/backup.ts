import { mkdirSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { copyDatabase, describeTarget, flagValue, openClient } from './lib.ts'

// npm run backup                → a dated copy of the database in data/backups/
// npm run backup -- --to file.db → somewhere else
// Works the same for Turso and a local file.

const target = describeTarget(process.env)
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const file = flagValue('--to') ?? `data/backups/garage-${target.remote ? 'turso' : 'local'}-${stamp}.db`
mkdirSync(file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.', { recursive: true })

console.log(`Backing up ${target.label}\n  → ${file}`)
const { version, counts } = await copyDatabase(openClient(process.env), createClient({ url: `file:${file}` }))
console.log(`Done: schema version ${version}, ${Object.values(counts).reduce((a, b) => a + b, 0)} rows.`)
