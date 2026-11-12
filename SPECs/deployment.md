# Deployment: Vercel + Turso

Status: draft, waiting on one decision (§ Staff sign-in)
Date: 2026-11-12
Related: README.md, SPECs/open-questions.md

## Problem Statement

The app runs only on one laptop. Its data is a SQLite file (`data/garage.db`, via `node:sqlite`), and customer ID photos are saved to `data/uploads/`. Nothing is deployed, and nothing is connected to Vercel yet.

Vercel runs the server as serverless functions with temporary disks, so neither the SQLite file nor the photo folder would survive there. The app also has **no sign-in**. Once it's on a public URL, anyone who finds the URL could read every customer, their phone number and their licence and passport photos.

## Solution

- **Hosting:** Vercel, building the TanStack Start app with Nitro's `vercel` preset instead of `node-server`.
- **Database:** Turso, which hosts SQLite (libSQL). Created through the Vercel Marketplace, so `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set on the Vercel project. The schema and SQL stay as they are.
- **ID photos:** Vercel Blob in a **private** store. Reads need the store's credentials, so photos are still served only through `/api/documents/:id`, never by a direct Blob URL.
- **Staff sign-in** before anything goes live (decision below).
- **Data move:** a one-off import of the live `garage.db` into Turso, keeping every ID.
- **Local development** keeps working offline. The same client opens `file:data/garage.db` when no Turso URL is set.

## User Stories

1. As staff, I want to open the app from any device with a web address, so that I'm not tied to one laptop.
2. As staff, I want the cars, customers, rentals, finance sales and maintenance I've already entered to be there on the deployed app, unchanged.
3. As the owner, I want only staff to be able to see the app, so that customer details and ID photos stay private.
4. As staff, I want uploaded ID photos to stay private and to survive deploys.
5. As the owner, I want the database backed up automatically and restorable to an earlier point, so that a mistake or bad deploy can be undone.
6. As the developer, I want to keep running the app and tests locally against a file, without the internet.

## Implementation Decisions

### Database client (the biggest change)

- Replace `node:sqlite`'s `DatabaseSync` with `@libsql/client`. It connects to the Turso URL and token when they are set, and to `file:data/garage.db` (or `DATABASE_PATH`) when they are not. Tests use `:memory:`.
- The libSQL client is **async**, so every data-module function that reads or writes becomes `async`, and so do callers, server functions and tests. The work is mechanical: about 80 `db.prepare`/`db.exec` call sites across 10 server modules.
- A small wrapper in `db.server.ts` keeps call sites short (`all`, `get`, `run` with named or positional parameters), so the modules read much as they do today.
- `inTransaction(fn)` becomes `inTransaction(async (tx) => ...)` on top of the client's write transaction. Code inside a transaction must use `tx`, not `db`, so concurrent requests can't interleave writes.
- Where a function runs several independent statements, use a `batch` (one round trip) instead of a transaction (one round trip per statement).
- **Foreign keys:** check that `ON DELETE RESTRICT/CASCADE/SET NULL` is enforced on Turso the same as locally. A test runs against a local file with `PRAGMA foreign_keys = ON`, and the import is checked with `PRAGMA foreign_key_check`.
- `PRAGMA journal_mode = WAL` applies only to a local file.

### Migrations

- Stop running migrations when the server starts. On Vercel, every cold start would race to migrate the database.
- Migrations run as an explicit step: `npm run migrate`, run locally against the Turso database before a deploy that needs one. Tests still migrate their in-memory database.
- Keep tracking the schema version with `PRAGMA user_version` if Turso supports reading and setting it. Otherwise switch to a one-row `schema_version` table, seeded from `user_version` (8) during the import.
- The existing rule stays: back up before migrating. On Turso, that means creating a branch or point-in-time copy first.

### ID photos

- `documents.server.ts` writes to a private Vercel Blob store (`@vercel/blob`, `access: 'private'`) instead of `data/uploads/`. The database keeps only the blob path.
- `/api/documents/:id` reads the blob on the server and streams it back with the existing private, no-store headers. The Blob URL is never sent to the browser.
- Locally, with no Blob token set, keep writing to `data/uploads/`. Both live behind one small storage interface (`put`, `get`, `delete`).
- There are no photos yet (`data/uploads` is empty), so there's nothing to move.

### Staff sign-in (decision needed)

The app must not go live without it. Two ways:

- **A. Sign-in inside the app (recommended).** A `staff` table with name, email and a hashed password, a login page and a signed session cookie (httpOnly, secure, SameSite=Lax). Every page, server function and `/api/documents/:id` checks for a session. Accounts are created with a command-line script, so there's no public sign-up page. This also makes "recorded by" possible later. It works on Vercel's free Hobby plan.
- **B. Vercel Deployment Protection.** Vercel asks for a sign-in before the site loads. There's no code to write, but each staff member needs a seat on a Vercel team (paid), and protecting the production URL depends on the plan. Check current Vercel pricing before choosing this.

To decide: how many people will use it, and do you want A?

### Hosting and regions

- Set the Nitro preset to `vercel`. Remove `node-server`, or keep it selectable through an environment variable for running locally with `npm start`.
- **Region:** the app's users are in Melbourne, and every query is a round trip from the Vercel function to Turso. Put both as close together as possible: Vercel functions in `syd1`, and Turso in its nearest available region. Turso's region list could not be confirmed here (Sydney is not confirmed). Pick it in the Turso dashboard and run Vercel functions in the same or nearest region.
- Node 24 runtime (matches local `v24.13.0`).
- Environment variables, set in the Vercel dashboard and never committed:
  - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`;
  - `BLOB_READ_WRITE_TOKEN`, used only off Vercel, because on Vercel the SDK can use OIDC;
  - `SESSION_SECRET` if option A.
- Preview deployments use a separate Turso database (a branch or copy), never the live one.

### Moving the live data

1. Stop the local dev server and back up `data/garage.db`.
2. Checkpoint the WAL file (`PRAGMA wal_checkpoint(TRUNCATE)`) so the `.db` file is complete.
3. Create the Turso database from that file, using Turso's import from an existing SQLite file.
4. Verify: row counts per table match the local file, `PRAGMA foreign_key_check` returns nothing, and the schema version is 8.
5. Point production at it, sign in, and click through the cars, customers, rentals, finance sales and maintenance pages.

After this, the deployed Turso database is the real one. The laptop file becomes a dev copy, and the live data shouldn't be edited in both places.

### Backups

- Rely on Turso's point-in-time restore. The window depends on the plan; check it.
- Add `npm run backup`, which downloads a copy of the Turso database to a dated local file. Run it before every migration.

## Testing Decisions

- The whole existing suite (89 tests) passes on the async client with `:memory:`. That is the main check for the async change.
- New tests:
  - a transaction rolls back every write when one statement fails;
  - foreign keys are enforced (RESTRICT, CASCADE and SET NULL each have one case);
  - the storage interface round-trips a photo locally;
  - with option A: no session means a redirect or a 401 for pages, server functions and the document route, and a wrong password is refused.
- After deploying: one manual pass in the browser on the preview deployment, with a copy of the data.

## Order of work

1. Async libSQL client and `inTransaction`; all modules and tests converted. Behaviour stays exactly the same, and this can merge on its own.
2. Migration command and backup script.
3. Photo storage interface with local and Blob backends.
4. Staff sign-in (once decided).
5. Vercel preset, region and env vars; preview deploy with a copy of the data.
6. Import the live data into Turso; production deploy.

## Out of Scope

- Staff roles and permissions; everyone signed in sees everything.
- Offline use or Turso embedded replicas.
- Custom domain setup (can be added in Vercel at any time).
- Merging the stacked feature branches; that's done before step 5, separately.
