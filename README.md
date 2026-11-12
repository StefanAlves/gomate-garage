# Garage

Customer and car registry for a garage. Built with TanStack Start and SQLite (libSQL: a local file in development, Turso in production), deployed on Vercel. Staff only: every page needs a sign-in.

```sh
npm install
npm run dev                 # http://localhost:3000, against data/garage.db
npm run build && npm start  # production build on plain Node (Node 24+)
npm test                    # Vitest, against an in-memory database
npm run typecheck
```

### Where the data lives

| | Local (`npm run dev`) | Vercel |
|---|---|---|
| Database | `data/garage.db` (`DATABASE_PATH`) | Turso (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) |
| ID photos | `data/uploads/customer-documents/` (`UPLOADS_PATH`) | private Vercel Blob store (`BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID`) |

An explicit `DATABASE_PATH` always wins over the Turso settings, so local development and tests never touch the live database even when `.env` holds Turso credentials. `.env` is git-ignored; never commit it.

Customer ID photos (driver's licence front/back, passport) are never public: they are served only through `/api/documents/:id` to signed-in staff, with `Cache-Control: private, no-store`. The database holds only each photo's file name, so back the photos up together with the database.

### Scripts

The scripts read `.env`, so without `DATABASE_PATH` they act on **Turso**. Prefix `DATABASE_PATH=data/garage.db` to act on the local file.

```sh
npm run backup                       # dated copy into data/backups/ (do this before every migration)
npm run migrate                      # bring the schema up to date (Turso needs -- --yes)
npm run staff -- list                # staff accounts
npm run staff -- add ana@example.com "Ana Lee"   # prints a new password once
npm run staff -- reset ana@example.com           # new password, signs them out everywhere
npm run staff -- disable ana@example.com         # blocks sign-in, signs them out everywhere
npm run import -- --from data/garage.db --yes    # one-off: copy a local file into an empty Turso database
```

### Sign-in

There is no sign-up page; staff accounts are made with `npm run staff`. Sessions last 30 days and are stored in the database (only a hash of the cookie), so signing out, a password reset or disabling an account takes effect at once. Five wrong passwords in a row lock an account for 15 minutes. Server functions and form posts must come from the site itself (CSRF check). To sign in locally, add yourself to the local file: `DATABASE_PATH=data/garage.db npm run staff -- add you@example.com "Your Name"`.

## Pages

Structure modelled on the GoMate back office (customers and vehicles).

| URL | What it does |
|---|---|
| `/customers` | Table: name/company, email, mobile (+ WhatsApp link), location, created. Search (name, company, phone, email, ABN, suburb), sort, page size |
| `/customers/new` | Quick create: personal + contact details |
| `/customers/:id` | Tabs (`?tab=`): **Contact** (full profile: address, marketing opt-ins, preferred contact, tags, licence/passport), **Rentals** and **Finance sales** (active first, Start buttons), and placeholders for Bookings, Invoices, Comms |
| `/cars` | Table: vehicle, rego, colour, purpose, status. Search (rego, make, model, VIN), sort, purpose and status filters, page size |
| `/cars/new` | Quick create: purpose (Rental car or Sale car, fixed), status (Preparation or Ready), basic details |
| `/cars/:id` | Purpose and status badges, Start rental / Start finance sale (Ready cars) or a link to the active rental or finance sale, maintenance summary tiles + tabs: **Specifications** (full specs, maintenance tracking, rego/insurance/compliance), **Stock** (Preparation ↔ Ready, weekly rent or asking / minimum price by purpose, odometer for sale cars, description, features, compliance + financial summary), **Rentals** and **Maintenance** (rental cars: service interval, odometer readings, services) or **Finance** and a Vehicle history placeholder (sale cars), **Fines**, **Tolls**, **Money** (ledger totals and entries), **Log**, and placeholders for Reminders, Invoices |
| `/fleet` | Fleet overview (GoMate's "Cars" section): income / P&L / ROI tiles by period, cars per stock status, customers behind on rentals and finance sales, rental cars due for a service, unpaid fines & tolls, rego and insurance due in 30 days |
| `/fleet/stock` | Cars as a **board** (Preparation, Ready, Rented, Under finance, Sold) or a **table** with prices and per-car P&L. Filter by purpose (columns follow it), search, sort (longest in stock, highest value, rego) |
| `/fleet/fines`, `/fleet/tolls` | Fines and tolls: date, rego, customer, (offence), notice #, amount, due date, status (Not paid, Transferred, Business paid, Paid by customer). Inline add / edit, filters, running total |
| `/fleet/transactions` | Per-car money ledger: initial investment, expense, rental / sale income, bond received / returned / kept. Tiles, filters (period, vehicle, category, method), inline add / edit, "Add bond", CSV export |
| `/fleet/rentals` | Rentals with what each customer owes, weeks behind and next due date. Filters (active / returned / all, behind on payments), search, sort by most owed |
| `/rentals/new` | Start a rental from a Ready rental car (`?car=`) or a customer (`?customer=`), or create a walk-in customer inline. Start date, weekly rent, bond received. Warns when no licence photo is on file |
| `/rentals/:id` | Summary tiles (rent, arrears / owed, paid, next due, bond held), record payment, change rent from a date, Return with bond settlement (arrears, fines and tolls from the rental period, damage → refund or shortfall), add an odometer reading with the car's next service, payments, rent history |
| `/fleet/sales` | Finance sales with balance, arrears, weeks behind and an Overdue badge. Filters (active / completed / defaulted / all, overdue only), search, sort by most behind |
| `/finance-sales/new` | Start a finance sale from a Ready sale car (`?car=`) or a customer (`?customer=`), walk-in buyers inline. Price, deposit, number of weekly instalments, optional instalment amount, with a live preview of the plan. 0 instalments = cash sale |
| `/finance-sales/:id` | Tiles (price, paid, balance, arrears, next due), instalment schedule with paid / overdue / upcoming, payments, Record payment, Payoff, Default (with reason), notes |
| `/fleet/maintenance` | Rental cars overdue for a service or due within 30 days / 1,000 km, with the renter's phone and WhatsApp, odometer (estimated when the last reading is old), last service, next due by date and km. Show all rental cars to find those without an interval |
| `/fleet/leads`, `/fleet/invoices` | Placeholders describing the GoMate modules still to build |

## Rules

Domain language lives in `GLOSSARY.md`. The business rents and sells its own cars only: see `docs/adr/0001-garage-owns-every-car.md`. The rules below describe the code as it is today. All specs in `SPECs/` are built; open points are in `SPECs/open-questions.md`.

- Every car belongs to the garage. A car has a fixed purpose, Rental car or Sale car, chosen when it's added and never changed.
- Plates are stored in uppercase and must be unique. VINs, when given, must be 17 characters and unique.
- A customer with rentals, fines, tolls or transactions can't be deleted. The same goes for a car.
- Car status follows the purpose. Rental car: Preparation → Ready → Rented → (Return) → Preparation. Sale car: Preparation → Ready → Under finance → Sold. Staff only move a car between Preparation and Ready; Starting a Rental sets Rented and the Return sets Preparation; a Finance Sale sets Under finance, then Sold when paid in full, or Preparation on Default. Rental cars have a weekly rent; sale cars an asking and minimum price.
- Money is stored as integer cents. Ledger amounts are positive; the category gives the direction. P&L = rental + sale income − investment − expenses; ROI = P&L ÷ (investment + expenses). Bonds are tracked separately ("bond held"); only the part kept at a Rental's Return (`bond_applied`) counts as income.
- Rentals: Rent is weekly in advance; week *k* is due on start + 7k at the rate in effect that day. Once returned, no new week falls due (a week due on the return date doesn't count), and nothing is pro-rated. Owed = Rent due + non-rent deductions − Rent paid − Bond kept: the Arrears while active, the unpaid shortfall after Return. Rent payments are `rental_income` ledger rows linked by `rental_id`. A rental car has at most one active Rental. Arrears at Return are always deducted (no waiver yet).
- Finance Sales: Deposit on the agreement date, then Instalment *k* due 7k days later; the last Instalment absorbs rounding. Terms are locked once started (notes stay editable). Payments are `sale_income` ledger rows linked by `finance_sale_id` and can't exceed the remaining balance; the payment that reaches the price completes the sale and makes the car Sold. 0 Instalments is a cash sale and completes at once. Overdue = any Arrears; nothing happens automatically. Default is a staff action: the car goes back to Preparation and payments are kept.
- Maintenance (Rental cars only): a service interval of N km and/or M months, whichever comes first, counted from the last service (or, with none, the first reading; the date from when the car was added). Odometer readings are kept as history and the latest is the car's odometer; a reading lower than an earlier one (or higher than a later one) needs "This is a correction". A service records its own reading and, when it cost anything, an `expense` in the ledger; deleting it removes both. Due soon = overdue, or within 30 days or 1,000 km. When the latest reading is 7+ days old, the km uses an estimate: km/day over the 60 days before that reading. Rental cars' odometer and next service can't be typed in on Specifications or Stock; Sale cars keep the manual fields.
- Picking a car on a fine or toll fills in the customer who has it now (active Rental or Finance Sale).
- Period filters use the garage's day in Australia/Melbourne; weeks start on Monday.
- Build and compliance dates are typed as MM/YYYY and stored as YYYY-MM. Other dates are YYYY-MM-DD.

## Database migrations

`src/server/migrations.server.ts` keeps an ordered list of migrations and tracks the applied count in the one-row `schema_version` table (Turso doesn't allow setting `PRAGMA user_version`; older local files are read from it). They run only from `npm run migrate` (never on server start; the app refuses to run against an older schema), each as one batch with foreign keys off and a foreign-key check before it commits. Back up first (`npm run backup`). Add new migrations to the end of the list; never edit one that has shipped.

## Layout

- `src/lib/schemas.ts`: Zod schemas shared by browser form validation and server validation.
- `src/server/*.server.ts`: SQL. Server-only; the build fails if client code imports it.
- `src/server/*.functions.ts`: typed server functions, the only bridge from UI to data.
- `src/lib/rent.ts`, `src/lib/finance.ts`: pure Rent, Instalment schedule, Arrears and settlement arithmetic.
- `src/routes/`: file-based routes.
- `src/components/`: forms and list toolbar.

## UI: React Aria Components + Panda CSS (GoMate design system)

- **Design tokens** match GoMate (`../go-mate/src/styles.css`), defined in `panda.config.ts`:
  - Palette: `red.500/600/700/tint`, `black`, `white`, `gray.50`–`gray.600`.
  - Semantic colors use the same names as go-mate: `background`, `foreground`, `card`, `popover`, `primary` (+ `.hover`, `.active`, `.tint`, `.foreground`), `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`. So go-mate's `bg-primary text-primary-foreground` becomes `css({ bg: 'primary', color: 'primary.foreground' })` here.
  - Radii `sm` 8 / `md` 12 / `lg` 16 / `xl` 24, fonts `sans` (Inter) and `display` (Montserrat, loaded in `__root.tsx`), shadow `cta`.
  - Text styles `display` and `eyebrow` (go-mate's `.gm-display` and `.gm-eyebrow`). The `accentBar` recipe is go-mate's `.gm-bar`.
  - Light-only, like the brand.
- **Components** come from [`react-aria-components`](https://react-aria.adobe.com). Wrappers live in `src/components/ui/`:
  - `Link`: React Aria link driven by TanStack Router (`createLink`), with typed `to` and intent preloading.
  - `Button`: GoMate pill button (`variant: solid | outline | ghost`, `size: sm | md | lg`).
- **Styling** uses [Panda CSS](https://panda-css.com) through `@pandacss/vite`. The `@layer` line in `src/styles.css` marks it as the CSS root.
  - React Aria state conditions are available as `_hovered`, `_pressed`, `_focusVisible`, `_selected`, `_invalid`, `_current`, `_open`, `_entering`, `_exiting`.
  - `styled-system/` is generated and gitignored. `npm install` regenerates it via `prepare`.
- **Legacy CSS:** the old variables in `src/styles.css` (`--bg`, `--accent`, …) are now aliases for the Panda tokens, so existing pages already use the brand. Those rules are unlayered and still override Panda. `preflight` stays off until they're migrated.
# gomate-garage
