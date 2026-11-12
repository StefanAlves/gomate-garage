# Rentals

Status: done (2026-11-12, branch `rentals`)
Date: 2026-11-12
Related: GLOSSARY.md, SPECs/car-purpose-and-ownership.md (prerequisite). Replaces the `/fleet/rentals` placeholder and the customer page's Rentals placeholder.

## Problem Statement

Renting Rental Cars is half of the business, but the app can't record a Rental. Staff can log `rental_income` and bond entries in the per-car ledger, but nothing ties them to the Customer and the period. So the app can't answer who has which Car, how much Rent they owe, or what to keep from the Bond when the Car comes back.

## Solution

A **Rental** is an open-ended arrangement: a Customer takes a Rental Car, pays a **Bond**, and then pays weekly **Rent** in advance until the **Return**.

- Staff start a Rental from a Ready Rental Car or from a Customer. They enter the start date, the weekly Rent and the Bond, and record the Bond payment. The Car becomes Rented.
- Staff record payments as they come in, in any amount. The app shows **Arrears**: Rent due to date minus Rent paid.
- Staff can **adjust the Rent** from a date. Earlier weeks keep their old amount.
- At **Return**, staff settle the Bond. They deduct Arrears, unpaid fines and tolls from the Rental period, and any damage (description plus amount). The remainder is refunded, or the Customer owes the shortfall. The Car goes back to Preparation.
- Staff can also start a Return when the Customer stops paying. It's the same flow, with a reason note.

## User Stories

1. As staff, I want to start a Rental from a Ready Rental Car's page, so that renting a Car takes one form.
2. As staff, I want to start a Rental from a Customer's page, choosing from Ready Rental Cars, so that I can work from either side.
3. As staff, I want to create the Customer inline while starting a Rental, so that a walk-in doesn't need two steps.
4. As staff, I want to enter the start date, weekly Rent and Bond, and mark the Bond as received (method and date), so that the money is recorded at handover.
5. As staff, I want the Car to become Rented when the Rental starts, so that it can't be rented twice.
6. As staff, I want to record a Rent payment of any amount with date and method, so that both normal weekly payments and catch-up payments fit.
7. As staff, I want each Rental to show Rent due to date, paid to date, Arrears and the next due date, so that I know where the Customer stands.
8. As staff, I want a list of all active Rentals with Customer, Car, weekly Rent, Arrears and weeks behind, sortable by Arrears, so that I can chase who is behind.
9. As staff, I want to change the weekly Rent from a given date, with the history kept, so that a price rise doesn't rewrite past weeks.
10. As staff, I want to Return a Rental with a Bond settlement screen that pre-fills Arrears and the unpaid fines and tolls for that Car and Customer during the Rental, so that I don't miss deductions.
11. As staff, I want to add damage deductions (description and amount) at Return, so that repairs come out of the Bond.
12. As staff, I want the settlement to show the refund, or the shortfall if deductions exceed the Bond, so that I know what to pay out or collect.
13. As staff, I want to give a reason when the garage ends the Rental (e.g. non-payment), so that the history explains it.
14. As staff, I want the Car to go back to Preparation on Return, so that it gets checked before the next Rental.
15. As staff, I want fines and tolls deducted at Return to be marked paid by the Customer, so that they don't show as unpaid any more.
16. As staff, I want a Customer to be able to have more than one Rental, at once or over time, so that repeat customers and small operators fit.
17. As staff, I want the Customer page's Rentals tab and the Car page to list Rentals (active first, then past), so that the history is one click away.
18. As staff, I want a Returned Rental that still has a shortfall to keep showing what's owed until it's paid, so that the debt isn't lost.

## Implementation Decisions

### Domain

- **Rental**: Customer, Rental Car, start date, Bond amount, status `active` | `returned`, return date, return reason, notes.
- **Rent schedule**: one or more `(effective_from, weekly_cents)` rows. The first row is the start date.
- **Rent due to date** (for the garage's day, Australia/Melbourne): Rent is weekly in advance, so week *k* (k = 0, 1, …) is due on start + 7k at the rate in effect that day. Due to date = the sum of every week due on or before today. After Return, no new weeks fall due. The last week isn't pro-rated.
- **Arrears** = Rent due to date − Rent paid. "Weeks behind" = Arrears ÷ current weekly Rent, rounded up.
- **Bond held** = Bond received − Bond refunded − Bond applied.
- **Settlement** at Return: the deductions are a list of `{ kind: 'rent_arrears' | 'fine' | 'toll' | 'damage' | 'other', amount, description, charge_id? }`. Refund = max(0, Bond held − deductions). Shortfall = max(0, deductions − Bond held), owed by the Customer on that Rental.
- A Rental Car can have at most one active Rental. Starting a Rental needs the Car to be Ready, and Return sets it to Preparation, in the same transaction.

### Schema (migration 6)

- `rentals`:
  - `id`
  - `customer_id`, `car_id`: RESTRICT
  - `start_date`
  - `bond_cents`
  - `status`
  - `returned_on`, `return_reason`, `notes`, timestamps
  - Partial unique index on `car_id` WHERE `status = 'active'`.
- `rental_rent_rates`:
  - `id`, `rental_id`
  - `effective_from`
  - `weekly_cents`
  - Unique `(rental_id, effective_from)`.
- `rental_deductions`:
  - `id`, `rental_id`
  - `kind`, `amount_cents`, `description`
  - `charge_id` (nullable, references charges).
- `transactions`:
  - add nullable `rental_id` (references rentals);
  - add category `bond_applied` (the part of the Bond kept against deductions).
  - Rent payments are `rental_income` rows with `rental_id` set. The ledger stays the single place money is recorded, so per-car P&L keeps working.
  - P&L counts `bond_applied` as income. "Bond held" subtracts it.
- Rename the charge status `paid_by_renter` to `paid_by_customer`, because it now covers Finance Sales too. Rename the stored key, not just the label.

### Modules

- **Rentals data module** (server-only, the main test seam):
  - `startRental`, `recordRentPayment`, `adjustRent`, `rentalSummary(id)` (due, paid, arrears, weeks behind, next due, bond held), `listRentals(search)`, `rentalsForCustomer`, `rentalsForCar`.
  - `settlementPreview(id, returnDate)`: suggested deductions, i.e. the Arrears plus `not_paid` / `business_paid` charges on that Car with that Customer dated within the Rental.
  - `returnRental(id, { returnDate, reason, deductions })`. In one transaction it writes the deductions, the `bond_applied` and `bond_returned` transactions, sets the linked charges to `paid_by_customer`, closes the Rental and moves the Car to Preparation.
- **Arrears calculation** as a pure function of (rates, start, end, payments, today), unit-tested separately and shared with Finance Sales where the shape fits.
- **Server functions** using the existing `{ ok, value } | { ok: false, errors }` result shape.
- **UI**:
  - `/fleet/rentals`: active Rentals list with an Arrears column and a "behind" filter. Replaces the placeholder.
  - `/rentals/:id`: summary tiles (Rent, Arrears, Bond held, next due), payments table, Rent history, notes.
  - "Start rental" form from the Car or Customer page.
  - Return wizard: pre-filled deductions, add damage, review refund or shortfall, confirm.
  - Customer page Rentals tab replaces the placeholder. Car page gets a Rentals tab for Rental Cars.

## Testing Decisions

- Pure tests for Rent due to date: a Rent change mid-way, a payment exactly on the due day, Return mid-week, a start date in the future.
- Data module tests: you can't start a Rental on a non-Ready or Sale Car, or on a Car that already has an active Rental. Return writes the expected transactions, updates the charges and moves the Car.
- Settlement cases: refund, exact zero, and shortfall.

## Implementation notes

- Defaults taken (2026-11-12): a licence photo isn't required to start a Rental (the form warns); no additional drivers, the renting Customer is responsible for fines and tolls.
- Arrears at Return are worked out by the server and always deducted; they can't be waived or edited yet.
- A week due on the Return date doesn't fall due; the first week is always due.
- After Return, payments towards a shortfall are recorded on the Rental as `rental_income`.
- Suggested fines and tolls include ones on the Car in the Rental period with no Customer set; settling them assigns them to the Customer.

## Out of Scope

- Damage photos and inspection checklists.
- Invoices, receipts and reminders to Customers.
- Fixed-term or daily hire.
- Rentals of Sale Cars, and converting a Rental into a Finance Sale.
