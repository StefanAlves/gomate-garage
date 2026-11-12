import '@tanstack/react-start/server-only'
import { checkReading, maintenanceDue, type MaintenanceDue, type MaintenanceState, type Reading } from '~/lib/maintenance'
import type { CarStatus, OdometerReadingValues, PaymentMethod, ServiceIntervalValues, ServiceValues } from '~/lib/schemas'
import { db, inTransaction, sqlNow, toCents } from './db.server'

// Rental Car maintenance (SPECs/maintenance.md): service interval, odometer
// history and services. The latest reading is cached in cars.mileage_km; the
// next service is always worked out, never stored, for Rental cars.

export interface OdometerReading extends Reading {
  id: number
  rentalId: number | null
  serviceId: number | null
  note: string | null
}

export interface Service {
  id: number
  servicedOn: string
  km: number
  description: string
  costCents: number
  transactionId: number | null
}

type CarRow = { purpose: 'rental' | 'sale'; km: number | null; months: number | null; createdOn: string }

const carRow = (carId: number) =>
  db.get<CarRow>(
    `SELECT purpose, service_interval_km AS km, service_interval_months AS months, substr(created_at, 1, 10) AS createdOn
     FROM cars WHERE id = ?`, [carId],
  )

const readingsOf = (carId: number) =>
  db.all<OdometerReading>(
    `SELECT id, read_on AS readOn, km, rental_id AS rentalId, service_id AS serviceId, note
     FROM odometer_readings WHERE car_id = ? ORDER BY read_on DESC, id DESC`, [carId],
  )

const servicesOf = (carId: number) =>
  db.all<Service>(
    `SELECT id, serviced_on AS servicedOn, km, description, cost_cents AS costCents, transaction_id AS transactionId
     FROM services WHERE car_id = ? ORDER BY serviced_on DESC, id DESC`, [carId],
  )

/** Sets the cached odometer to the latest reading (by date, then entry order). */
async function refreshOdometer(carId: number) {
  await db.run(
    `UPDATE cars SET mileage_km = (SELECT km FROM odometer_readings WHERE car_id = :carId ORDER BY read_on DESC, id DESC LIMIT 1),
       updated_at = ${sqlNow}
     WHERE id = :carId`, { carId },
  )
}

/** Readings come back newest first; the pure calculation doesn't mind the order. */
function dueFor(car: CarRow, readings: readonly OdometerReading[], services: readonly Service[], today: string): MaintenanceDue {
  const last = services[0]
  return maintenanceDue({
    interval: { km: car.km, months: car.months },
    lastService: last ? { servicedOn: last.servicedOn, km: last.km } : null,
    readings: [...readings].reverse(),
    createdOn: car.createdOn,
    today,
  })
}

/** Everything the Maintenance tab shows. Null for an unknown car. */
export async function getMaintenance(carId: number, today: string) {
  const car = await carRow(carId)
  if (!car) return null
  const [readings, services] = await Promise.all([readingsOf(carId), servicesOf(carId)])
  return {
    interval: { km: car.km, months: car.months },
    readings,
    services,
    due: dueFor(car, readings, services, today),
  }
}

export async function setServiceInterval(carId: number, v: ServiceIntervalValues): Promise<'ok' | 'not_found' | 'not_rental'> {
  const car = await carRow(carId)
  if (!car) return 'not_found'
  if (car.purpose !== 'rental') return 'not_rental'
  await db.run(
    `UPDATE cars SET service_interval_km = :km, service_interval_months = :months, updated_at = ${sqlNow} WHERE id = :carId`,
    { carId, km: v.km, months: v.months },
  )
  return 'ok'
}

type RecordFailure = 'not_found' | 'not_rental' | 'future' | 'lower_than_earlier' | 'higher_than_later'

/** Checks a km reading against the car and its history, before anything is written. */
async function checkNewReading(carId: number, readOn: string, km: number, correction: boolean, today: string): Promise<RecordFailure | null> {
  const car = await carRow(carId)
  if (!car) return 'not_found'
  if (car.purpose !== 'rental') return 'not_rental'
  if (readOn > today) return 'future'
  if (correction) return null
  const fit = checkReading(await readingsOf(carId), { readOn, km })
  return fit === 'ok' ? null : fit
}

async function insertReading(carId: number, readOn: string, km: number, note: string | null, serviceId: number | null) {
  const { lastInsertRowid } = await db.run(
    `INSERT INTO odometer_readings (car_id, read_on, km, note, service_id, rental_id)
     VALUES (:carId, :readOn, :km, :note, :serviceId,
       (SELECT id FROM rentals WHERE car_id = :carId AND status = 'active' AND start_date <= :readOn))`,
    { carId, readOn, km, note, serviceId },
  )
  await refreshOdometer(carId)
  return lastInsertRowid
}

/**
 * Records an odometer reading. One that's lower than an earlier reading (or
 * higher than a later one) is refused unless staff mark it as a correction.
 * A reading taken while the car is rented is linked to that Rental.
 */
export function recordReading(carId: number, v: OdometerReadingValues, today: string):
  Promise<{ ok: true; id: number } | { ok: false; reason: RecordFailure }> {
  return inTransaction(async () => {
    const failure = await checkNewReading(carId, v.readOn, v.km, v.correction, today)
    if (failure) return { ok: false, reason: failure }
    return { ok: true, id: await insertReading(carId, v.readOn, v.km, v.note, null) }
  })
}

/** Removes a mistaken reading. A service's reading goes only with its service. */
export function deleteReading(id: number): Promise<'ok' | 'not_found' | 'from_service'> {
  return inTransaction(async () => {
    const row = await db.get<{ carId: number; serviceId: number | null }>(
      'SELECT car_id AS carId, service_id AS serviceId FROM odometer_readings WHERE id = ?', [id],
    )
    if (!row) return 'not_found'
    if (row.serviceId != null) return 'from_service'
    await db.run('DELETE FROM odometer_readings WHERE id = ?', [id])
    await refreshOdometer(row.carId)
    return 'ok'
  })
}

/**
 * Records a service: the service, its odometer reading and (when it cost
 * anything) an `expense` in the car's ledger, all or nothing. It restarts the
 * countdown to the next service.
 */
export function recordService(carId: number, v: ServiceValues, today: string):
  Promise<{ ok: true; id: number } | { ok: false; reason: RecordFailure }> {
  return inTransaction(async () => {
    const failure = await checkNewReading(carId, v.servicedOn, v.km, v.correction, today)
    if (failure) return { ok: false, reason: failure }
    const costCents = toCents(v.cost) ?? 0
    const transactionId = costCents > 0 ? await insertExpense(carId, v.servicedOn, costCents, v.method, v.description) : null
    const { lastInsertRowid: serviceId } = await db.run(
      `INSERT INTO services (car_id, serviced_on, km, description, cost_cents, transaction_id)
       VALUES (:carId, :servicedOn, :km, :description, :costCents, :transactionId)`,
      { carId, servicedOn: v.servicedOn, km: v.km, description: v.description, costCents, transactionId },
    )
    await insertReading(carId, v.servicedOn, v.km, null, serviceId)
    return { ok: true, id: serviceId }
  })
}

async function insertExpense(carId: number, occurredOn: string, amountCents: number, method: PaymentMethod | null, description: string) {
  const { lastInsertRowid } = await db.run(
    `INSERT INTO transactions (car_id, occurred_on, category, amount_cents, method, notes)
     VALUES (?, ?, 'expense', ?, ?, ?)`,
    [carId, occurredOn, amountCents, method, `Service: ${description}`.slice(0, 500)],
  )
  return lastInsertRowid
}

/** Removes a mistaken service with its reading and expense. */
export function deleteService(id: number): Promise<'ok' | 'not_found'> {
  return inTransaction(async () => {
    const row = await db.get<{ carId: number; transactionId: number | null }>(
      'SELECT car_id AS carId, transaction_id AS transactionId FROM services WHERE id = ?', [id],
    )
    if (!row) return 'not_found'
    await db.run('DELETE FROM services WHERE id = ?', [id]) // its reading cascades
    if (row.transactionId != null) await db.run('DELETE FROM transactions WHERE id = ?', [row.transactionId])
    await refreshOdometer(row.carId)
    return 'ok'
  })
}

// ---- Due-soon list ---------------------------------------------------------------

export interface MaintenanceListItem {
  id: number
  plate: string
  name: string
  status: CarStatus
  lastServiceOn: string | null
  rentalId: number | null
  renterId: number | null
  renterName: string | null
  renterPhone: string | null
  due: MaintenanceDue
}

export const isDue = (i: MaintenanceListItem) => i.due.state === 'overdue' || i.due.state === 'due_soon'

const urgency: Record<MaintenanceState, number> = { overdue: 0, due_soon: 1, no_interval: 2, ok: 3 }

/** How close a car is to its next service, in days, counting km at the car's recent pace (or 1,000 km ≈ 30 days). */
const closeness = (d: MaintenanceDue) => {
  const byKm = d.kmLeft == null ? Infinity : d.kmPerDay ? d.kmLeft / d.kmPerDay : (d.kmLeft * 30) / 1000
  return Math.min(d.daysLeft ?? Infinity, byKm)
}

/**
 * Rental cars with their service status and current Renter, most urgent
 * first. `due` keeps only those overdue or due soon.
 */
export async function dueSoonList(today: string, show: 'due' | 'all'): Promise<MaintenanceListItem[]> {
  const cars = await db.all<CarRow & Omit<MaintenanceListItem, 'due' | 'lastServiceOn'>>(
    `SELECT car.id, car.plate, (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS name, car.status,
       car.purpose, car.service_interval_km AS km, car.service_interval_months AS months,
       substr(car.created_at, 1, 10) AS createdOn,
       r.id AS rentalId, c.id AS renterId, (c.first_name || coalesce(' ' || c.last_name, '')) AS renterName, c.phone AS renterPhone
     FROM cars car
     LEFT JOIN rentals r ON r.car_id = car.id AND r.status = 'active'
     LEFT JOIN customers c ON c.id = r.customer_id
     WHERE car.purpose = 'rental'`,
  )

  // Two queries for all cars rather than two per car: each one is a round trip to the database.
  const [allReadings, allServices] = await Promise.all([
    db.all<OdometerReading & { carId: number }>(
      `SELECT car_id AS carId, id, read_on AS readOn, km, rental_id AS rentalId, service_id AS serviceId, note
       FROM odometer_readings ORDER BY read_on DESC, id DESC`,
    ),
    db.all<Service & { carId: number }>(
      `SELECT car_id AS carId, id, serviced_on AS servicedOn, km, description, cost_cents AS costCents, transaction_id AS transactionId
       FROM services ORDER BY serviced_on DESC, id DESC`,
    ),
  ])
  const byCar = <T extends { carId: number }>(rows: T[], carId: number) => rows.filter((r) => r.carId === carId)

  const items = cars.map(({ purpose, km, months, createdOn, ...car }): MaintenanceListItem => {
    const services = byCar(allServices, car.id)
    return {
      ...car,
      lastServiceOn: services[0]?.servicedOn ?? null,
      due: dueFor({ purpose, km, months, createdOn }, byCar(allReadings, car.id), services, today),
    }
  })
  return items
    .filter((i) => show === 'all' || isDue(i))
    .sort((a, b) => urgency[a.due.state] - urgency[b.due.state] || closeness(a.due) - closeness(b.due) || a.plate.localeCompare(b.plate))
}

/** How many Rental cars need a service soon, and how many have no interval set. Pass the full list if you already have it. */
export async function maintenanceCounts(today: string, all?: MaintenanceListItem[]) {
  all ??= await dueSoonList(today, 'all')
  const count = (s: MaintenanceState) => all.filter((i) => i.due.state === s).length
  return { overdue: count('overdue'), dueSoon: count('due_soon'), noInterval: count('no_interval') }
}
