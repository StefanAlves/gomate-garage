# Bookings Module

Status: ready-for-agent
Date: 2026-11-08
Related: README.md (Pages, Rules, Database migrations). Structure modelled on the GoMate back office (Customers → Bookings tab, Vehicles → Vehicle History tab).

## Problem Statement

The garage can register customers and cars but has no way to record work. When a customer calls about a service, a repair, or a car that's stuck waiting for parts, staff have to track it somewhere else (WhatsApp threads, paper, memory). So:

- There's no single list of what's booked today, what's in the workshop, and what's waiting for parts.
- A customer's page shows their cars but not the work done for them. The **Bookings** tab is a "Coming soon" placeholder.
- A car's page has no service history. The **Vehicle history** tab is a placeholder, and the maintenance tiles (latest odometer, next service) only change when someone edits the car by hand.
- Business-owned fleet cars (rentals, stock being prepared for sale) need workshop time too, but there's nowhere to record it.

## Solution

A **booking** is one piece of workshop work for a car and/or a customer, scheduled on a date and moving through a status from *Booked* to *Completed* (or *Cancelled*/*No show*).

- A new **Bookings** section in the top navigation lists every booking in a table, with ID, date, status, customer, vehicle, service and created date. You can search, filter by status and by period (today, upcoming, past, all), sort, and choose page size, the same way the Customers and Cars lists work.
- **New booking** opens a form where staff pick the customer and/or car, the service type, the date (and optional time), and describe the problem. Starting from a customer or car page fills that customer or car in. Picking a car fills in its owner.
- Each booking has its own page. Staff can change the status, edit details and add internal notes there.
- When staff complete a booking they can record the odometer reading and when the next service is due. Those values update the car's maintenance tiles, so the car record stays current without a separate edit.
- On a **customer's page**, the Bookings tab lists their bookings, with a count in the tab label and a "New booking" button.
- On a **car's page**, the Vehicle history tab lists every booking for that car, newest first, with a "New booking" button.

## User Stories

### Finding bookings

1. As front-desk staff, I want a Bookings link in the top navigation, so that I can reach the workshop schedule from anywhere.
2. As front-desk staff, I want to see all bookings in a table with ID, date, status, customer, vehicle, service and created date, so that I can scan the workload at a glance.
3. As front-desk staff, I want the bookings list to default to upcoming bookings (today onwards), earliest first, so that the first thing I see is what's coming in next.
4. As front-desk staff, I want to switch the period filter to Today, Upcoming, Past or All, so that I can answer "what's on today?" or look something up from last month.
5. As front-desk staff, I want to filter bookings by status, so that I can see everything waiting for parts or ready for pickup.
6. As front-desk staff, I want a quick "Open" status filter that covers every status that isn't finished, so that I can see all live work in one view.
7. As front-desk staff, I want to search bookings by booking ID, customer name, phone, rego, make or model, so that I can find a booking from whatever the customer tells me on the phone.
8. As front-desk staff, I want to sort bookings by date (earliest or latest first) or by date created, so that I can order the list the way the task needs.
9. As front-desk staff, I want the search, filters, sort and page in the URL, so that a filtered view survives a reload and can be bookmarked.
10. As front-desk staff, I want each status shown as a coloured badge, so that I can tell open, waiting and finished work apart at a glance.
11. As front-desk staff, I want clicking a booking's ID, customer or vehicle to take me to that booking, customer or car, so that I can move between related records quickly.
12. As front-desk staff, I want an empty state that tells me no bookings match, with a link to create one, so that an empty list isn't confusing.
13. As front-desk staff, I want to choose 25, 50 or 100 rows per page and page through results, so that long histories stay usable.

### Creating bookings

14. As front-desk staff, I want a "New booking" button on the bookings list, so that I can book work from the main schedule.
15. As front-desk staff, I want a "New booking" button on a customer's Bookings tab that pre-selects that customer, so that I don't have to search for them again.
16. As front-desk staff, I want a "New booking" button on a car's Vehicle history tab that pre-selects that car and its owner, so that booking a known car takes seconds.
17. As front-desk staff, I want picking a car to fill in its owner as the customer when I haven't chosen one yet, so that I don't enter the same relationship twice.
18. As front-desk staff, I want the customer picker to show only that customer's cars first once a customer is chosen, so that I pick the right vehicle quickly.
19. As front-desk staff, I want to book a business-owned (fleet/stock) car with no customer, so that workshop time on rental and sale cars is tracked too.
20. As front-desk staff, I want to book a customer without a car on file (for example, a first-time caller whose car isn't registered yet), so that I can take the booking now and register the car later.
21. As front-desk staff, I want to be stopped from saving a booking with neither customer nor car, so that every booking is attached to someone or something.
22. As front-desk staff, I want to choose a service type from a fixed list (General service, Logbook service, Repair, Diagnostics, Tyres, Brakes, Inspection / roadworthy, Detailing, Other), so that bookings can be grouped and reported on consistently.
23. As front-desk staff, I want to enter a date and an optional drop-off time, so that "Tuesday, any time" and "Tuesday 8:30" are both recorded correctly.
24. As front-desk staff, I want to describe the customer's concern in a free-text field, so that the mechanic knows what the customer reported.
25. As front-desk staff, I want new bookings to start with status *Booked*, so that I don't have to set it every time.
26. As front-desk staff, I want to be taken to the new booking's page after saving, so that I can confirm the details or keep editing.
27. As front-desk staff, I want field-level validation errors shown next to the field, in the browser and again on the server, consistent with the customer and car forms, so that mistakes are obvious and bad data never gets in.

### Working a booking

28. As a mechanic, I want to open a booking and see the customer (with phone and WhatsApp link), the car (rego, make, model, odometer), the service type, date and description together, so that I have everything I need for the job.
29. As a mechanic, I want to change a booking's status (Booked → Confirmed → In progress → Waiting for parts → Ready for pickup → Completed), so that the front desk always knows where the job is.
30. As a mechanic, I want to move a booking into and out of *Waiting for parts* more than once, so that the status reflects reality when parts arrive in stages.
31. As front-desk staff, I want to mark a booking *Cancelled* or *No show*, so that bookings that didn't happen are kept for the record and not deleted.
32. As front-desk staff, I want to reopen a completed, cancelled or no-show booking by setting it back to an open status, so that I can fix a booking that was closed by mistake.
33. As a mechanic, I want to add internal notes to a booking, separate from the customer's description, so that workshop observations aren't confused with what the customer said.
34. As front-desk staff, I want to change a booking's date, time, service type, customer or car, so that I can reschedule or fix mistakes without recreating it.
35. As front-desk staff, I want to see when a booking was created, last updated and completed, so that I can answer "when did we do that?" accurately.

### Completing a booking

36. As a mechanic, I want to enter the odometer reading when I complete a booking, so that the car's mileage history is captured at each visit.
37. As a mechanic, I want the car's latest odometer updated when a booking records a higher reading, so that the car's summary tile is current without editing the car.
38. As a mechanic, I want a lower odometer reading on a booking to leave the car's latest odometer alone, so that entering an old booking late can't wind the car's odometer back.
39. As a mechanic, I want to optionally set the next service date and/or km when completing a booking, so that the car's maintenance tracking is updated in the same step.
40. As front-desk staff, I want the completion date recorded automatically when a booking moves to *Completed*, and cleared if it's reopened, so that completion dates are always accurate.

### Bookings in context

41. As front-desk staff, I want a customer's Bookings tab to list all their bookings (ID, date, status, vehicle, service, created), newest first, so that I can see their history while talking to them.
42. As front-desk staff, I want the customer's Bookings tab label to show the booking count, so that I know whether there's history before opening it.
43. As a mechanic, I want a car's Vehicle history tab to list every booking for that car (date, status, service, odometer, customer), newest first, so that I can see what was done before.
44. As a mechanic, I want the car's history to include bookings made under a previous owner, so that the history follows the car, not the customer.
45. As front-desk staff, I want the Vehicle history tab label to show the booking count, so that I know at a glance whether the car has been in before.

### Deleting and data integrity

46. As front-desk staff, I want to delete a booking that was created by mistake, using the same two-step confirm as customers and cars, so that I can tidy up without a browser dialog.
47. As front-desk staff, I want to be prevented from deleting a customer who has bookings, with a message saying why, so that work history is never silently lost.
48. As front-desk staff, I want to be prevented from deleting a car that has bookings, with a message saying why, so that a car's service history is never silently lost.
49. As the business owner, I want existing customers and cars to be unaffected when the bookings feature is installed, so that upgrading is safe.

## Implementation Decisions

### Domain

- **Booking**: workshop work for a **car** and/or a **customer**, on a **scheduled date** with an optional **drop-off time**. At least one of customer or car is required. A booking may reference a car that belongs to a different customer (or to the business), because a car's owner can change after it was booked. Bookings are historical records and never follow ownership changes.
- **Booking ID**: the integer primary key, shown to users as-is (e.g. "#12"). No formatted reference numbers in this module.
- **Statuses** (stored as stable keys; labels belong in the existing format module alongside car status labels):
  - Open: `booked` (default), `confirmed`, `in_progress`, `waiting_for_parts`, `ready_for_pickup`
  - Finished: `completed`, `cancelled`, `no_show`
  - Any status can move to any other; there's no enforced state machine. The list's "Open" filter means every non-finished status. *Assumption:* only "Waiting for Parts" was seen in GoMate; the rest of the list is proposed here.
- **Service types** (stable keys + labels): `general_service`, `logbook_service`, `repair`, `diagnostics`, `tyres`, `brakes`, `inspection`, `detailing`, `other`.

### Schema (migration 3, appended to the existing migration list)

- New table `bookings`:
  - `id` integer primary key
  - `customer_id` nullable, references customers, ON DELETE RESTRICT
  - `car_id` nullable, references cars, ON DELETE RESTRICT
  - `scheduled_date` text, required, YYYY-MM-DD
  - `scheduled_time` text, nullable, HH:MM (24h)
  - `service_type` text, required
  - `status` text, required, default `booked`
  - `description` text, nullable (the customer's concern)
  - `internal_notes` text, nullable
  - `odometer_km` integer, nullable
  - `completed_at` text, nullable, ISO timestamp
  - `created_at` / `updated_at`, same defaults as existing tables
  - Table CHECK: `customer_id IS NOT NULL OR car_id IS NOT NULL`
- Indexes on `customer_id`, `car_id`, and `(scheduled_date, scheduled_time)`.
- No changes to the `customers` or `cars` columns. RESTRICT foreign keys are what block deleting a customer or car that has bookings.

### Modules

- **Shared schemas** (isomorphic, Zod): add `bookingInputSchema`, `updateBookingSchema`, `bookingListSearchSchema` (q, page, size, sort, status, period) with stripped defaults, plus `BOOKING_STATUSES`, `OPEN_BOOKING_STATUSES` and `SERVICE_TYPES`. Optional "next service date/km" are fields of the update input (not columns on bookings). The schema enforces "customer or car" so the browser shows the error before the server's CHECK constraint is hit. As with the existing schemas, parsing must be idempotent, because the server re-validates the browser's parsed output.
- **Bookings data module** (server-only, SQL; deep module, the main test seam). Interface:
  - `listBookings(search)` → `{ items, total, page, pageCount }`. Items carry the joined display fields (customer name and phone, car plate, make, model and year) so list rows need no extra queries.
  - `bookingsForCustomer(customerId)` and `bookingsForCar(carId)`, newest first.
  - `getBooking(id)` → the full booking with joined customer and car summary, or null.
  - `insertBooking(values)` → id. If a car is given without a customer and the car has an owner, the owner is recorded as the customer.
  - `updateBooking(id, values)` → boolean. In **one transaction** it:
    - sets `completed_at` when the status becomes `completed` (keeping the existing value if it was already completed) and clears it when the status moves away from `completed`;
    - when completed with an odometer reading greater than the car's `mileage_km` (or the car has none), raises the car's `mileage_km`;
    - when next service date/km are provided, writes them to the car.
  - `deleteBooking(id)` → boolean.
  - Counts for tab labels come back with the customer and car detail data instead of separate calls.
- **Server functions** (the existing typed RPC file): `listBookings`, `getBooking`, `createBooking`, `updateBooking`, `deleteBooking`, using the existing `{ ok, value } | { ok: false, errors }` result shape. Foreign-key failures map to field errors (`customerId` / `carId`: "no longer exists"). `getCustomer` and `getCar` also return that record's bookings.
- **Customer and car delete errors**: the existing foreign-key message for customers ("still owns cars") must cover bookings too. The car delete server function, which doesn't handle foreign-key errors today, must return "This car has bookings; it can't be deleted" instead of throwing.
- **UI**:
  - Routes for the bookings list, new booking (accepts `customerId` and `carId` search params to pre-select), and booking detail. Add the top-nav link.
  - The booking form follows the existing customer/car form pattern (shared form hook, field sections, select fields). Its sections:
    - **Who & what:** customer, car, service type
    - **When:** date, time
    - **Details:** description
    - **Workshop:** status, odometer, internal notes
    - **Next service:** shown only when the status is Completed
  - On create, the form shows only the first three sections.
  - Car picker: when a customer is selected, that customer's cars are listed first and other cars after a divider. Choosing a car while the customer is empty fills in the car's owner. This is client-side behaviour only; the server repeats the owner default on insert.
  - The booking detail page header shows ID, status badge, date/time, customer (with WhatsApp link, reusing the existing helper) and car (rego, name). Below it is the edit form with the two-step delete button.
  - The customer page's Bookings tab and the car page's Vehicle history tab replace their "Coming soon" placeholders with real tables. Their tab labels show counts.
  - New CSS status badge classes for the booking statuses, following the existing car status badge classes.
- **Dates and times** stay strings in fixed formats. "Today" for the period filter is computed **on the server** in the garage's timezone (Australia/Melbourne, a constant), never the browser's. Display uses the existing fixed-locale, UTC-safe formatter.

## Testing Decisions

- **What makes a good test:** it drives the module only through its public interface and checks what a user would notice: rows returned, filters applied, values persisted, the car's odometer after completion, errors raised. Tests must not inspect SQL text, private helpers or call order. They should survive any internal refactor that keeps the behaviour.
- **Seam (one, the highest available):** the **bookings data module**, run against a **real SQLite database** in a temporary file. The database path is already configurable through `DATABASE_PATH`, and the server-only marker import is an empty module outside Vite, so the module loads in Vitest unchanged. Each test file gets a fresh database, so the migrations run for real and are covered implicitly. Inputs are built by parsing form-shaped objects through `bookingInputSchema`, so tests go through the same path as production (browser parse → server parse → data module).
  - Not tested directly: server function wrappers and route components. They're thin and covered by the manual browser check below.
- **Behaviours to cover at that seam:**
  - Insert with customer only, car only (owner auto-filled; business car stays customer-less), and both. Inserting with neither is rejected by the schema.
  - List filters: each period (Today / Upcoming / Past / All, using an injected "today" so tests don't depend on the clock), status, the "Open" group, text search across ID, customer, phone, rego, make and model, sort orders, and pagination totals.
  - Completion: `completed_at` is set; it's kept on re-save; it's cleared on reopen. A higher odometer raises the car's mileage. A lower one leaves it alone. Next service date/km are written to the car. The whole update is atomic, so a failure leaves neither the booking nor the car changed.
  - `bookingsForCar` includes bookings made under a previous owner.
  - Deleting a customer or car with bookings fails with a foreign-key error. Deleting a booking succeeds.
  - Migration safety: a database at schema version 2 with existing customers and cars migrates to version 3 with every row intact.
  - Schema idempotence: parsing the parsed output of `bookingInputSchema` gives the same value (same check used for the customer and car schemas).
- **Testability decision:** `listBookings` accepts an optional "today" value (defaulting to the Melbourne date). Without it, period-filter tests would depend on the clock.
- **Tooling:** add Vitest to the garage project (`npm test`). Prior art: `go-mate`'s `instalment.test.ts`, which uses Vitest with behaviour-named `describe`/`it` blocks and asserts only on public outputs. Garage has no tests yet; this module adds its first suite.
- **Manual check:** after implementation, click through create → status changes → complete with odometer → check the car's tiles, customer tab and vehicle history in the browser. Use a copy of the database (start the dev server with `DATABASE_PATH` set to the copy).

## Out of Scope

- **Calendar view** (day/week grid, drag to reschedule). The list's period and status filters cover scheduling for now.
- **Invoices and quotes** generated from a booking, plus parts and labour line items, pricing and payments.
- **Customer notifications**: booking confirmations, reminders, or "ready for pickup" messages by email/SMS/WhatsApp (belongs with the car Reminders and customer Comms tabs).
- **Partner / mechanic assignment**: GoMate's model of handing a job to a partner workshop, and assigning bookings to staff members. There are no user or partner entities yet.
- **Workshop capacity**: bays, time slots, double-booking warnings, estimated durations.
- **Online self-booking** by customers.
- **Rentals and loan cars** (the customer Rentals tab), even though they also link customers to fleet cars.
- **Attachments or photos** on bookings.
- **An audit log** of who changed a booking's status and when (beyond `updated_at` / `completed_at`).
- **Users and authentication**: the app has no user accounts yet, so there's no "booked by" field.

## Further Notes

- The GoMate reference showed one booking with **no vehicle** (status "Waiting for Parts", service "Other"). That's why a booking only needs a customer *or* a car, not both.
- If ownership changes, bookings keep the customer they were made for. A car's history is queried by car, a customer's bookings by customer. This is deliberate: an old service belongs to the person who brought the car in.
- Raising the car's odometer only upward is a guard against entering old bookings late. If someone typed a wrong high reading, they fix it on the car's Specifications tab, as they would today.
- Proposed status and service-type lists are the main assumptions in this spec. Confirm or adjust them before implementation; they're stored as keys, so labels can change freely later but keys should not.
- Calendar, invoices and notifications all read from bookings. Keeping the data module's interface small and stable (list / for-customer / for-car / get / insert / update / delete) is what lets them build on it later.
