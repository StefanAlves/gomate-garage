# Finance Sales

Status: done (2026-11-12, branch `finance-sales`)
Date: 2026-11-12
Related: GLOSSARY.md, docs/adr/0001-garage-owns-every-car.md, SPECs/car-purpose-and-ownership.md (prerequisite). Shares the arrears calculation with SPECs/rentals.md.

## Problem Statement

The garage sells Sale Cars on in-house finance: a Deposit, then a fixed number of weekly Instalments, with the garage owning the Car until the last one is paid. The app can only log `sale_income` against a Car. It doesn't know the terms of the deal, what's due, who is behind, or when ownership has passed.

## Solution

A **Finance Sale** records the deal for a Sale Car:

- the sale price;
- the **Deposit**;
- the number of weekly **Instalments** and their amount;
- the agreement date.

The first Instalment is due one week after the agreement date.

- Starting a Finance Sale (from a Ready Sale Car) records the Deposit and makes the Car **Under finance**.
- Staff record payments of any amount. The app shows **Arrears** and the remaining balance.
- When the total paid reaches the amount payable, the Finance Sale completes and the Car becomes **Sold**. This happens either through the last Instalment or through a **Payoff** of the remaining balance (no discount).
- If the Customer stops paying, the app highlights it and staff can **Default** the Finance Sale. The Car goes back to Preparation and the garage keeps everything already paid. Default is always a staff decision.
- A rare **cash sale** is a Finance Sale with zero Instalments, where the Deposit is the full price. It completes immediately.
- The terms are locked once the Finance Sale starts.

## User Stories

1. As staff, I want to start a Finance Sale from a Ready Sale Car's page, so that selling a Car is one form.
2. As staff, I want to choose or create the Customer inline, so that a new buyer doesn't need two steps.
3. As staff, I want to enter the sale price, Deposit, number of Instalments and agreement date, and see the Instalment amount worked out, so that the plan adds up.
4. As staff, I want to override the Instalment amount (the last Instalment absorbs rounding), so that I can match the paperwork exactly.
5. As staff, I want the Deposit recorded as a payment when the Finance Sale starts, so that money and deal never disagree.
6. As staff, I want the Car to become Under finance when the Finance Sale starts, so that it can't be sold twice.
7. As staff, I want a cash sale to be a Finance Sale with zero Instalments that completes at once, so that the rare cash buyer uses the same flow.
8. As staff, I want to record a payment of any amount with date and method, so that catch-up payments fit.
9. As staff, I want each Finance Sale to show the amount payable, paid to date, remaining balance, Arrears, weeks behind, next due date and the Instalment schedule (paid, due, upcoming), so that I can answer the Customer's questions.
10. As staff, I want a list of active Finance Sales with Customer, Car, remaining balance, Arrears and weeks behind, sortable by Arrears, with an "overdue" badge for anyone behind, so that I see who needs a call.
11. As staff, I want the Finance Sale to complete and the Car to become Sold as soon as the total paid reaches the amount payable, so that ownership passes at exactly the right moment.
12. As staff, I want a "Payoff" action that pre-fills the remaining balance as a payment, so that early payoff is one step.
13. As staff, I want a "Default" action, with a confirm step and a reason, that ends the Finance Sale, returns the Car to Preparation and keeps the payments, so that I can take a Car back when I decide to.
14. As staff, I want fines and tolls on an Under finance Car to be linkable to the Finance Sale's Customer with the same statuses as Rentals, so that they're passed on the same way.
15. As staff, I want the Customer page to list their Finance Sales and the Car page to show its Finance Sale, so that the deal is one click away.

## Implementation Decisions

### Domain

- **Finance Sale**: Customer, Sale Car, agreement date, sale price, Deposit, Instalment count *n* (≥ 0), Instalment amount, status `active` | `completed` | `defaulted`, completed/defaulted date, default reason, notes.
- **Amount payable** = sale price. Deposit + n × Instalment amount must equal it, and the last Instalment absorbs rounding. Any interest is already included in the price, and the app doesn't calculate interest.
- Instalment *k* (k = 1…n) is due on agreement date + 7k days.
- **Due to date** = Deposit + the sum of Instalments due on or before today (Australia/Melbourne). **Arrears** = due to date − paid. **Remaining balance** = amount payable − paid.
- **Completion**: the payment that brings the total paid to the amount payable sets the status to `completed` and the Car to `sold`, in one transaction. A payment that would overshoot is rejected, with the remaining balance shown.
- **Overdue** flag: Arrears > 0. The app only displays it. Nothing happens automatically.
- **Default**: only from `active`. It sets `defaulted`, sets the Car to `preparation`, and keeps the payments.
- **Locked terms**: price, Deposit, n and Instalment amount can't be edited after creation. Notes stay editable.
- A Sale Car can have at most one active Finance Sale. A Sold Car can't start another.

### Schema (migration 7, after the Rentals migration)

- `finance_sales`:
  - `id`
  - `customer_id`, `car_id`: RESTRICT
  - `agreed_on`
  - `price_cents`, `deposit_cents`
  - `instalment_count`, `instalment_cents`
  - `status`
  - `closed_on`, `default_reason`, `notes`, timestamps
  - CHECK that the parts add up.
  - Partial unique index on `car_id` WHERE `status = 'active'`.
- `transactions`: add nullable `finance_sale_id`. Deposit and Instalment payments are `sale_income` rows with it set, so per-car P&L and ROI keep working.

### Modules

- **Finance Sales data module** (server-only, main test seam):
  - `startFinanceSale` (writes the Deposit transaction; completes immediately when n = 0)
  - `recordFinancePayment` (completes when paid in full)
  - `payoff`
  - `defaultFinanceSale`
  - `financeSummary(id)`: payable, paid, balance, arrears, weeks behind, next due, schedule with per-Instalment state
  - `listFinanceSales(search)`, `financeSalesForCustomer`, `financeSaleForCar`
- **Arrears calculation:** reuse the pure function from Rentals, fed with a schedule of (due date, amount) rows.
- **UI**:
  - `/fleet/sales`: active Finance Sales, with an overdue filter.
  - `/finance-sales/:id`: tiles, schedule table, payments, Payoff and Default actions.
  - "Start finance sale" form on Ready Sale Cars.
  - Customer page tab for Finance Sales.
  - Fleet overview tile: number of overdue Finance Sales and total Arrears.

## Testing Decisions

- Pure tests: the schedule with rounding, due to date before the first Instalment, after the last Instalment, and with partial payments.
- Data module tests:
  - completion on an exact final payment, and on Payoff;
  - an overshooting payment is rejected;
  - a cash sale completes at creation;
  - Default moves the Car to Preparation and keeps the payments;
  - a second active Finance Sale on the same Car is rejected.

## Implementation notes

- Defaults taken (2026-11-12): a licence photo isn't required (the form warns). After a Default the sale takes no more payments; whether the Customer still owes the balance is open (see open-questions §2.1).
- The Fleet overview shows overdue Finance Sales next to Rentals behind on payments.
- Story 14: fines and tolls use the shared `paid_by_customer` status; picking a car in the fine / toll form fills in its current holder.
- Payments edited or deleted on the Transactions page aren't re-checked against completion; record corrections as new payments instead.

## Out of Scope

- Rescheduling or changing terms, hardship arrangements, late fees, and interest calculation.
- Third-party lenders.
- Ownership transfer paperwork and rego transfer.
- Contracts, invoices and payment reminders.
