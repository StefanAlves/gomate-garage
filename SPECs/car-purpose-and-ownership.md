# Car Purpose and Ownership

Status: ready-for-agent
Date: 2026-11-12
Related: GLOSSARY.md, docs/adr/0001-garage-owns-every-car.md. Prerequisite for SPECs/rentals.md, SPECs/finance-sales.md and SPECs/maintenance.md.

## Problem Statement

The app models a Car as owned by a Customer, or by the business when it has no owner. The business doesn't work that way: every Car belongs to the garage, and a Customer only ever rents one or buys one on in-house finance. Because of the mismatch:

- Staff can record a Customer as a Car's "owner", which means nothing to the business. One live Car has an owner today.
- A Car can be flagged both "For rent" and "For sale". In practice each Car is kept for exactly one of these, permanently.
- The status "Out" can mean rented or sold-on-finance-but-not-paid-off, and "Returned" duplicates Preparation.

## Solution

- Remove Car ownership. A Customer relates to a Car only through a Rental or a Finance Sale (see their specs).
- Give every Car a fixed **purpose**: **Rental Car** or **Sale Car**. It is chosen when the Car is created and can't be changed afterwards.
- Replace the stock statuses with:
  - Rental Car: Preparation → Ready → **Rented** → (Return) → Preparation
  - Sale Car: Preparation → Ready → **Under finance** → **Sold**. A Default sends the Car back to Preparation.
- Rented, Under finance and Sold are set only by starting or ending a Rental or Finance Sale, never by editing the Car. Staff move a Car only between Preparation and Ready by hand.

## User Stories

1. As staff, I want to choose Rental Car or Sale Car when I add a Car, so that it shows up in the right lists from day one.
2. As staff, I want a Car's purpose to be shown everywhere the Car appears (list, page header, stock board), so that I never offer a Rental Car for sale.
3. As staff, I want the purpose to be read-only after creation, so that nobody changes it by accident.
4. As staff, I want a Rental Car to show a rent price and a Sale Car to show asking and minimum prices, and nothing else, so that the Stock tab only asks for what applies.
5. As staff, I want to move a Car between Preparation and Ready myself, so that I can mark it ready once it's prepared.
6. As staff, I want Rented, Under finance and Sold to change only through a Rental or Finance Sale, so that the status always matches what's actually happening to the Car.
7. As staff, I want the stock board columns to be Preparation, Ready, Rented, Under finance and Sold, filterable by purpose, so that I see each pipeline clearly.
8. As staff, I want the Cars list to filter by purpose and status instead of by owner, so that I can find "Rental Cars ready to go" quickly.
9. As staff, I want a Customer's page to show their Rentals and Finance Sales, not "their cars", so that the page reflects the real relationship.

## Implementation Decisions

### Domain

- `CAR_PURPOSES = ['rental', 'sale']`.
- `CAR_STATUSES = ['preparation', 'ready', 'rented', 'under_finance', 'sold']`. Allowed per purpose:
  - rental: preparation, ready, rented
  - sale: preparation, ready, under_finance, sold
- Manual status edits are limited to preparation ↔ ready. Every other transition belongs to the Rentals and Finance Sales modules, inside their own transactions.

### Schema (migration 5, appended to the migration list)

- Rebuild `cars` (SQLite can't drop or alter columns in place), following the migration 2 pattern:
  - drop `customer_id`;
  - add `purpose TEXT NOT NULL CHECK (purpose IN ('rental','sale'))`;
  - replace the `for_rent` / `for_sale` flags with `purpose` and keep the price columns;
  - add a CHECK that ties status to purpose.
- Data mapping for existing rows:
  - `purpose`: `for_rent` only → rental; `for_sale` only → sale; both or neither → **sale**, and list those Cars in the migration notes so staff can review them. (There are 11 Cars in the live database, all in Preparation or Ready.)
  - Status: `out` → rented if the purpose is rental, else under_finance; `returned` → preparation; the rest unchanged.
  - `customer_id`: dropped. The one Car that has an owner today simply becomes a garage Car.
- Back up the database file before running, as earlier migrations did.

### Modules

- **Shared schemas:** add `purpose` to the car create schema, required. The Stock schema validates the price fields by purpose. Remove `owner` from the Cars list search schema and add `purpose`.
- **Cars data module:** remove owner joins, the owner filter, the owner column and every "owns cars" check. Customer delete no longer checks Cars, because Rentals, Finance Sales, charges and transactions carry the RESTRICT foreign keys.
- The uncommitted "+ New customer" quick action (car owner) was discarded on 2026-11-12. Starting a Rental or Finance Sale, with inline Customer creation, replaces it.
- **UI:**
  - Car create form: a purpose selector at the top.
  - Car page: a purpose badge in the header.
  - Stock tab: shows the price fields for the Car's purpose.
  - Cars list: owner column and filter removed; purpose column and filter added.
  - Customer page: the Cars tab is removed (the Rentals tab is covered in SPECs/rentals.md).

## Testing Decisions

- Migration test: build a version-4 database with Cars covering each flag/status combination plus one owned Car, run migration 5, and assert purpose, status and dropped ownership.
- Data module tests against an in-memory database: you can't set a status that doesn't match the purpose; manual status changes outside preparation ↔ ready are rejected.

## Out of Scope

- Changing a Car's purpose. Revisit this if Rental Cars start being retired into sale (see the ADR).
- Rentals, Finance Sales and Maintenance themselves, which have their own specs.
