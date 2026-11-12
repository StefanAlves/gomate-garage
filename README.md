# Garage

Customer and car registry for a garage. Built with TanStack Start and SQLite (Node's built-in `node:sqlite`).

```sh
npm install
npm run dev                 # http://localhost:3000
npm run build && npm start  # production (Node 24+)
npm test                    # Vitest, against an in-memory database
npm run typecheck
```

Data is stored in `data/garage.db`, created on first run. Set `DATABASE_PATH` to use a different file.

Customer ID photos (driver's licence front/back, passport) are stored in `data/uploads/customer-documents/`, outside `public/`. They are served only through `/api/documents/:id` with `Cache-Control: private, no-store`. Set `UPLOADS_PATH` to move the folder. Back it up together with the database: the database holds only each photo's file name.

## Pages

Structure modelled on the GoMate back office (customers and vehicles).

| URL | What it does |
|---|---|
| `/customers` | Table: name/company, email, mobile (+ WhatsApp link), location, created. Search (name, company, phone, email, ABN, suburb), sort, page size |
| `/customers/new` | Quick create: personal + contact details |
| `/customers/:id` | Tabs (`?tab=`): **Contact** (full profile: address, marketing opt-ins, preferred contact, tags, licence/passport), **Rentals** (active first, Start rental), and placeholders for Bookings, Invoices, Comms |
| `/cars` | Table: vehicle, rego, colour, purpose, status. Search (rego, make, model, VIN), sort, purpose and status filters, page size |
| `/cars/new` | Quick create: purpose (Rental car or Sale car, fixed), status (Preparation or Ready), basic details |
| `/cars/:id` | Purpose and status badges, Start rental (Ready rental cars) or a link to the active rental, maintenance summary tiles + tabs: **Specifications** (full specs, maintenance tracking, rego/insurance/compliance), **Stock** (Preparation ↔ Ready, weekly rent or asking / minimum price by purpose, odometer, description, features, compliance + financial summary), **Rentals** (rental cars only), **Fines**, **Tolls**, **Money** (ledger totals and entries), **Log**, and placeholders for Vehicle history, Reminders, Invoices |
| `/fleet` | Fleet overview (GoMate's "Cars" section): income / P&L / ROI tiles by period, cars per stock status, unpaid fines & tolls, rego and insurance due in 30 days |
| `/fleet/stock` | Cars as a **board** (Preparation, Ready, Rented, Under finance, Sold) or a **table** with prices and per-car P&L. Filter by purpose (columns follow it), search, sort (longest in stock, highest value, rego) |
| `/fleet/fines`, `/fleet/tolls` | Fines and tolls: date, rego, customer, (offence), notice #, amount, due date, status (Not paid, Transferred, Business paid, Paid by customer). Inline add / edit, filters, running total |
| `/fleet/transactions` | Per-car money ledger: initial investment, expense, rental / sale income, bond received / returned / kept. Tiles, filters (period, vehicle, category, method), inline add / edit, "Add bond", CSV export |
| `/fleet/rentals` | Rentals with what each customer owes, weeks behind and next due date. Filters (active / returned / all, behind on payments), search, sort by most owed |
| `/rentals/new` | Start a rental from a Ready rental car (`?car=`) or a customer (`?customer=`), or create a walk-in customer inline. Start date, weekly rent, bond received. Warns when no licence photo is on file |
| `/rentals/:id` | Summary tiles (rent, arrears / owed, paid, next due, bond held), record payment, change rent from a date, Return with bond settlement (arrears, fines and tolls from the rental period, damage → refund or shortfall), payments, rent history |
| `/fleet/leads`, `/fleet/invoices` | Placeholders describing the GoMate modules still to build |

## Rules

Domain language lives in `GLOSSARY.md`. The business rents and sells its own cars only: see `docs/adr/0001-garage-owns-every-car.md`. The rules below describe the code as it is today. Still to build: `SPECs/finance-sales.md` and `SPECs/maintenance.md`; open points are in `SPECs/open-questions.md`.

- Every car belongs to the garage. A car has a fixed purpose, Rental car or Sale car, chosen when it's added and never changed.
- Plates are stored in uppercase and must be unique. VINs, when given, must be 17 characters and unique.
- A customer with rentals, fines, tolls or transactions can't be deleted. The same goes for a car.
- Car status follows the purpose. Rental car: Preparation → Ready → Rented → (Return) → Preparation. Sale car: Preparation → Ready → Under finance → Sold. Staff only move a car between Preparation and Ready; Starting a Rental sets Rented and the Return sets Preparation; Finance Sales will set the sale statuses. Rental cars have a weekly rent; sale cars an asking and minimum price.
- Money is stored as integer cents. Ledger amounts are positive; the category gives the direction. P&L = rental + sale income − investment − expenses; ROI = P&L ÷ (investment + expenses). Bonds are tracked separately ("bond held"); only the part kept at a Rental's Return (`bond_applied`) counts as income.
- Rentals: Rent is weekly in advance; week *k* is due on start + 7k at the rate in effect that day. Once returned, no new week falls due (a week due on the return date doesn't count), and nothing is pro-rated. Owed = Rent due + non-rent deductions − Rent paid − Bond kept: the Arrears while active, the unpaid shortfall after Return. Rent payments are `rental_income` ledger rows linked by `rental_id`. A rental car has at most one active Rental. Arrears at Return are always deducted (no waiver yet).
- Period filters use the garage's day in Australia/Melbourne; weeks start on Monday.
- Build and compliance dates are typed as MM/YYYY and stored as YYYY-MM. Other dates are YYYY-MM-DD.

## Database migrations

`src/server/migrations.server.ts` keeps an ordered list of migrations and tracks the applied count in `PRAGMA user_version`. They run on server start, each in a transaction with a foreign-key check. Add new migrations to the end of the list; never edit one that has shipped.

## Layout

- `src/lib/schemas.ts`: Zod schemas shared by browser form validation and server validation.
- `src/server/*.server.ts`: SQL. Server-only; the build fails if client code imports it.
- `src/server/*.functions.ts`: typed server functions, the only bridge from UI to data.
- `src/lib/rent.ts`: pure Rent / Arrears / settlement arithmetic.
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
