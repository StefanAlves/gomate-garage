# Garage

Customer and car registry for a garage. Built with TanStack Start and SQLite (Node's built-in `node:sqlite`).

```sh
npm install
npm run dev                 # http://localhost:3000
npm run build && npm start  # production (Node 24+)
```

Data is stored in `data/garage.db`, created on first run. Set `DATABASE_PATH` to use a different file.

Customer ID photos (driver's licence front/back, passport) are stored in `data/uploads/customer-documents/`, outside `public/`. They are served only through `/api/documents/:id` with `Cache-Control: private, no-store`. Set `UPLOADS_PATH` to move the folder. Back it up together with the database: the database holds only each photo's file name.

## Pages

Structure modelled on the GoMate back office (customers and vehicles).

| URL | What it does |
|---|---|
| `/customers` | Table: name/company, email, mobile (+ WhatsApp link), location, cars, created. Search (name, company, phone, email, ABN, suburb), sort, page size |
| `/customers/new` | Quick create: personal + contact details |
| `/customers/:id` | Tabs (`?tab=`): **Contact** (full profile: address, marketing opt-ins, preferred contact, tags, licence/passport), **Cars**, and placeholders for Bookings, Invoices, Comms, Rentals |
| `/cars` | Table: vehicle, rego, colour, owner, status. Search (rego, make, model, VIN, owner), sort, owner filter (`?owner=business` or a customer id), page size |
| `/cars/new` | Quick create: owner, status, basic details. `?customerId=` preselects the owner |
| `/cars/:id` | Maintenance summary tiles + tabs: **Specifications** (full specs, maintenance tracking, rego/insurance/compliance), **Stock** (status, rent / sale listing and prices, odometer, description, features, compliance + financial summary), **Fines**, **Tolls**, **Money** (ledger totals and entries), **Log**, and placeholders for Vehicle history, Reminders, Invoices |
| `/fleet` | Fleet overview (GoMate's "Cars" section): income / P&L / ROI tiles by period, cars per stock status, unpaid fines & tolls, rego and insurance due in 30 days |
| `/fleet/stock` | Business-owned cars as a **board** (Preparation, Ready, Out, Sold, Returned) or a **table** with prices and per-car P&L. Filter for sale / for rent, search, sort (longest in stock, highest value, rego) |
| `/fleet/fines`, `/fleet/tolls` | Fines and tolls: date, rego, customer, (offence), notice #, amount, due date, status (Not paid, Transferred, Business paid, Paid by renter). Inline add / edit, filters, running total |
| `/fleet/transactions` | Per-car money ledger: initial investment, expense, rental / sale income, bond received / returned. Tiles, filters (period, vehicle, category, method), inline add / edit, "Add bond", CSV export |
| `/fleet/rentals`, `/fleet/leads`, `/fleet/invoices` | Placeholders describing the GoMate modules still to build |

## Rules

Domain language lives in `GLOSSARY.md`. The business rents and sells its own cars only: see `docs/adr/0001-garage-owns-every-car.md`. The rules below describe the code as it is today. Rules marked *(changing)* are replaced by `SPECs/car-purpose-and-ownership.md`, `SPECs/rentals.md`, `SPECs/finance-sales.md` and `SPECs/maintenance.md`.

- *(changing)* A car is owned by one customer, or by the business when it has no owner (fleet / stock).
- Plates are stored in uppercase and must be unique. VINs, when given, must be 17 characters and unique.
- A customer who still owns cars, or has fines, tolls or transactions, can't be deleted. The same goes for a car with fines, tolls or transactions.
- *(changing)* Car status is the stock lifecycle: Preparation → Ready → Out (with a customer) → Sold / Returned. "For rent" and "For sale" are separate flags with their own prices.
- Money is stored as integer cents. Ledger amounts are positive; the category gives the direction. P&L = rental + sale income − investment − expenses; ROI = P&L ÷ (investment + expenses). Bonds are tracked separately ("bond held") and never count as income.
- Period filters use the garage's day in Australia/Melbourne; weeks start on Monday.
- Build and compliance dates are typed as MM/YYYY and stored as YYYY-MM. Other dates are YYYY-MM-DD.

## Database migrations

`src/server/db.server.ts` keeps an ordered list of migrations and tracks the applied count in `PRAGMA user_version`. They run on server start, each in a transaction with a foreign-key check. Add new migrations to the end of the list; never edit one that has shipped.

## Layout

- `src/lib/schemas.ts`: Zod schemas shared by browser form validation and server validation.
- `src/server/*.server.ts`: SQL. Server-only; the build fails if client code imports it.
- `src/server/garage.functions.ts`: typed server functions, the only bridge from UI to data.
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
