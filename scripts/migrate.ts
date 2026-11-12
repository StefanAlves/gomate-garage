import { latestVersion, migrate, schemaVersion } from '../src/server/migrations.server.ts'
import { describeTarget, fail, hasFlag, openClient } from './lib.ts'

// npm run migrate              → the database the environment points at
// DATABASE_PATH=... npm run migrate → a local file
// Back up first (npm run backup). Turso needs --yes.

const target = describeTarget(process.env)
const db = openClient(process.env)
const before = await schemaVersion(db)
console.log(`${target.label}\nSchema version ${before}; this code needs ${latestVersion}.`)
if (before === latestVersion) process.exit(0)
if (before > latestVersion) fail('The database is newer than this code. Pull the latest code first.')
if (target.remote && !hasFlag('--yes'))
  fail(`\nThis changes the live Turso database. Back it up first (npm run backup), then run:\n  npm run migrate -- --yes`)
await migrate(db)
console.log(`Migrated to version ${await schemaVersion(db)}.`)
