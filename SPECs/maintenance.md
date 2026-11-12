# Rental Car Maintenance

Status: ready-for-agent
Date: 2026-11-12
Related: GLOSSARY.md, SPECs/car-purpose-and-ownership.md, SPECs/rentals.md. Replaces the retired SPECs/bookings-module.md.

## Problem Statement

Rental Cars spend most of their time with Renters, and each one needs servicing every so many kilometres or months. Today a Car has a single `mileage_km` and hand-edited `next_service_date` / `next_service_km` fields. Nobody records when a service was actually done, and nothing warns staff that a rented Car is close to due. A missed service is easy.

## Solution

- Each Rental Car has a **service interval**: every *N* km and every *M* months, whichever comes first.
- Staff record **odometer readings** (date + km) whenever they get one, e.g. a dashboard photo the Renter sends with their weekly Rent. Readings are kept as history, and the latest becomes the Car's odometer.
- Staff record **services** (date, odometer, description, cost). A service resets the countdown.
- The app works out **next service due** by date and by km. A **due-soon list** shows Rental Cars due within 30 days or 1,000 km, or overdue, like the existing rego and insurance "due in 30 days" panel.

## User Stories

1. As staff, I want to set a Rental Car's service interval (km and months), so that the app knows when it's due.
2. As staff, I want to record an odometer reading with a date from the Car or Rental page, so that km-based due dates stay current while the Car is rented.
3. As staff, I want to see a Car's odometer history, so that I can spot readings that look wrong.
4. As staff, I want a reading lower than the previous one to be rejected unless I confirm it's a correction, so that typos don't break the countdown.
5. As staff, I want to record a service with date, odometer, description and cost, so that the service history is complete.
6. As staff, I want the service cost to go into the Car's ledger as an expense, so that P&L includes maintenance.
7. As staff, I want each Rental Car to show last service, next due date, next due km, and km/days remaining, so that I can tell the Renter when to bring it in.
8. As staff, I want a due-soon list of Rental Cars that are overdue or due within 30 days or 1,000 km, with the current Renter and their phone number, so that I can call them to book the Car in.
9. As staff, I want the due-soon count on the fleet overview, so that I see it without going looking.
10. As staff, I want an estimate when the latest reading is old (km per day from recent readings), so that I can see that a Car is probably due even when the Renter hasn't sent a reading.

## Implementation Decisions

### Domain

- Applies to Rental Cars only. Sale Cars keep their existing manual fields.
- **Next due date** = last service date + M months. **Next due km** = last service km + N. With no service recorded, the first reading or the Car's created date is the baseline.
- **Due soon** = overdue by either measure, or within 30 days, or within 1,000 km of the latest reading. The thresholds are constants for now.
- **Estimated km** (story 10) = latest reading + average km/day over the last 60 days of readings × days since that reading. It's shown as an estimate and never stored.
- The existing transmission service fields stay manual and are out of scope.

### Schema (migration 8)

- `cars`:
  - add `service_interval_km`, `service_interval_months` (nullable; a Rental Car without an interval shows "Set interval").
  - `mileage_km` stays as the cached latest reading.
  - `next_service_date` / `next_service_km` become derived for Rental Cars and stop being editable for them.
- `odometer_readings`:
  - `id`, `car_id` (RESTRICT)
  - `read_on`, `km`
  - `rental_id` (nullable)
  - `note`, timestamps
- `services`:
  - `id`, `car_id` (RESTRICT)
  - `serviced_on`, `km`
  - `description`, `cost_cents`
  - `transaction_id` (nullable, the linked `expense` row)
  - timestamps

### Modules

- **Maintenance data module:**
  - `recordReading`: updates `mileage_km` when the reading is the latest.
  - `recordService`: writes the reading and an `expense` transaction in one transaction.
  - `maintenanceStatus(carId)`
  - `dueSoon()`: joins the active Rental for the Renter's name and phone.
- **Due calculation** as a pure function of (interval, last service, readings, today).
- **UI**:
  - Rental Car page: a Maintenance tab (status tiles, readings, services) that replaces the Vehicle history placeholder for Rental Cars.
  - "Add reading" on the Rental page too.
  - `/fleet/maintenance` for the due-soon list.
  - A fleet overview tile.

## Testing Decisions

- Pure tests:
  - due by date before km and by km before date;
  - no service yet;
  - an old reading with an estimate;
  - a correction reading lower than the previous one.
- Data module tests: a service writes the reading and the expense; a lower reading without confirmation is rejected.

## Out of Scope

- Public workshop bookings and job statuses (the retired bookings spec).
- Reminders sent to Renters.
- Maintenance for Sale Cars.
- Parts and inventory.
