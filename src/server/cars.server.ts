import '@tanstack/react-start/server-only'
import { db, inTransaction, likePattern, sqlNow, toCents, type Args } from './db.server'
import { addDays, garageToday } from '~/lib/period'
import { ATTENTION_DAYS } from '~/lib/attention'
import { totalsColumns, withPnl, type Totals } from './transactions.server'
import { MANUAL_CAR_STATUSES } from '~/lib/schemas'
import type {
  CarFeature, CarPurpose, CarStatus, CarStockValues, CarValues, FuelType, NewCarValues, carListSearchSchema, stockSearchSchema,
} from '~/lib/schemas'
import type { z } from 'zod'

export interface Car {
  id: number
  /** Fixed for life: every car belongs to the garage and is kept for renting or for selling. */
  purpose: CarPurpose
  status: CarStatus
  plate: string
  make: string
  model: string
  variant: string | null
  year: number | null
  color: string | null
  vin: string | null
  engineNumber: string | null
  buildDate: string | null
  complianceDate: string | null
  engineType: string | null
  cylinders: number | null
  fuelType: FuelType | null
  transmission: string | null
  bodyStyle: string | null
  radioPin: string | null
  mileageKm: number | null
  nextServiceDate: string | null
  nextServiceKm: number | null
  nextTransmissionDate: string | null
  nextTransmissionKm: number | null
  regoExpiry: string | null
  insuranceProvider: string | null
  insurancePolicy: string | null
  insuranceExpiry: string | null
  ppsrChecked: boolean
  writtenOff: boolean
  notes: string | null
  weeklyRateCents: number | null
  askingPriceCents: number | null
  minPriceCents: number | null
  listingDescription: string | null
  features: CarFeature[]
  createdAt: string
  updatedAt: string
}
export type CarListItem = Pick<
  Car,
  'id' | 'purpose' | 'status' | 'plate' | 'make' | 'model' | 'variant' | 'year' | 'color' | 'regoExpiry' | 'createdAt'
>

type Row = Omit<Car, 'ppsrChecked' | 'writtenOff' | 'features'> & {
  ppsrChecked: number
  writtenOff: number
  features: string
}

const fromRow = (r: Row): Car => ({
  ...r,
  ppsrChecked: !!r.ppsrChecked,
  writtenOff: !!r.writtenOff,
  features: (r.features ? r.features.split(',') : []) as CarFeature[],
})
const toParams = (v: CarValues | NewCarValues): Args =>
  ({ ...v, ppsrChecked: v.ppsrChecked ? 1 : 0, writtenOff: v.writtenOff ? 1 : 0 })

const from = `FROM cars car`

const listColumns = `car.id, car.purpose, car.status, car.plate, car.make, car.model, car.variant, car.year, car.color,
  car.rego_expiry AS regoExpiry, car.created_at AS createdAt`

// How urgently the rego needs attention, matching `carAttention` in ~/lib/attention:
// 0 expired, 1 no date recorded, 2 expires within ATTENTION_DAYS, NULL fine. Sold cars are never flagged.
const urgency = `CASE WHEN car.status = 'sold' THEN NULL WHEN car.rego_expiry IS NULL THEN 1
  WHEN car.rego_expiry < :today THEN 0 WHEN car.rego_expiry <= :soon THEN 2 END`

const allColumns = `car.id, car.purpose, car.status,
  car.plate, car.make, car.model, car.variant, car.year, car.color, car.vin, car.engine_number AS engineNumber,
  car.build_date AS buildDate, car.compliance_date AS complianceDate, car.engine_type AS engineType, car.cylinders,
  car.fuel_type AS fuelType, car.transmission, car.body_style AS bodyStyle, car.radio_pin AS radioPin,
  car.mileage_km AS mileageKm, car.next_service_date AS nextServiceDate, car.next_service_km AS nextServiceKm,
  car.next_transmission_date AS nextTransmissionDate, car.next_transmission_km AS nextTransmissionKm,
  car.rego_expiry AS regoExpiry, car.insurance_provider AS insuranceProvider, car.insurance_policy AS insurancePolicy,
  car.insurance_expiry AS insuranceExpiry, car.ppsr_checked AS ppsrChecked, car.written_off AS writtenOff,
  car.notes, car.weekly_rate_cents AS weeklyRateCents, car.asking_price_cents AS askingPriceCents, car.min_price_cents AS minPriceCents,
  car.listing_description AS listingDescription, car.features,
  car.created_at AS createdAt, car.updated_at AS updatedAt`

const orderBy = {
  // Flagged cars by their earliest date; cars with nothing to do by plate.
  urgent: 'urgency IS NULL, urgency, CASE WHEN urgency IS NOT NULL THEN car.rego_expiry END, car.plate COLLATE NOCASE',
  rego_expiry: 'car.rego_expiry IS NULL, car.rego_expiry, car.plate COLLATE NOCASE',
  plate: 'car.plate COLLATE NOCASE',
  recent: 'car.created_at DESC, car.id DESC',
  make_asc: 'car.make COLLATE NOCASE ASC, car.model COLLATE NOCASE ASC, car.year DESC',
} as const satisfies Record<z.output<typeof carListSearchSchema>['sort'], string>

export async function listCars(
  { q, page, size, sort, purpose, status, attention }: z.output<typeof carListSearchSchema>,
  today = garageToday(),
) {
  const conditions: string[] = []
  const params: Record<string, string | number> = { today, soon: addDays(today, ATTENTION_DAYS) }
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR car.make LIKE :like ESCAPE '\\' OR car.model LIKE :like ESCAPE '\\'
      OR car.vin LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  if (purpose) {
    conditions.push('car.purpose = :purpose')
    params.purpose = purpose
  }
  if (status) {
    conditions.push('car.status = :status')
    params.status = status
  }
  const where = (extra: string[] = []) => {
    const all = [...conditions, ...extra]
    return all.length ? `WHERE ${all.join(' AND ')}` : ''
  }
  // `attentionCount` ignores the attention filter so the heading can offer it.
  const counts = (await db.get<{ total: number; attentionCount: number }>(
    `SELECT COUNT(*) AS total, COUNT(${urgency}) AS attentionCount ${from} ${where()}`, params,
  ))!
  const total = attention ? counts.attentionCount : counts.total
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(page, pageCount)
  const items = await db.all<CarListItem>(
    `SELECT ${listColumns}, ${urgency} AS urgency ${from} ${where(attention ? [`${urgency} IS NOT NULL`] : [])}
     ORDER BY ${orderBy[sort]} LIMIT :limit OFFSET :offset`,
    { ...params, limit: size, offset: (current - 1) * size },
  )
  return { items, total, attentionCount: counts.attentionCount, page: current, pageCount, today }
}

export async function getCar(id: number) {
  const row = await db.get<Row>(`SELECT ${allColumns} ${from} WHERE car.id = ?`, [id])
  return row ? fromRow(row) : null
}

const fields = `plate, make, model, variant, year, color, vin, engine_number, build_date,
  compliance_date, engine_type, cylinders, fuel_type, transmission, body_style, radio_pin, mileage_km,
  next_service_date, next_service_km, next_transmission_date, next_transmission_km, rego_expiry,
  insurance_provider, insurance_policy, insurance_expiry, ppsr_checked, written_off, notes`
const values = `:plate, :make, :model, :variant, :year, :color, :vin, :engineNumber, :buildDate,
  :complianceDate, :engineType, :cylinders, :fuelType, :transmission, :bodyStyle, :radioPin, :mileageKm,
  :nextServiceDate, :nextServiceKm, :nextTransmissionDate, :nextTransmissionKm, :regoExpiry,
  :insuranceProvider, :insurancePolicy, :insuranceExpiry, :ppsrChecked, :writtenOff, :notes`

/**
 * Adds a car. A Rental car's odometer goes in as its first reading, and its
 * next service is worked out from its interval rather than typed in.
 */
export function insertCar(v: NewCarValues) {
  const params = v.purpose === 'rental' ? { ...v, nextServiceDate: null, nextServiceKm: null } : v
  return inTransaction(async () => {
    const { lastInsertRowid: id } = await db.run(
      `INSERT INTO cars (purpose, status, ${fields}) VALUES (:purpose, :status, ${values})`, toParams(params),
    )
    if (v.purpose === 'rental' && v.mileageKm != null)
      await db.run(`INSERT INTO odometer_readings (car_id, read_on, km, note) VALUES (?, ?, ?, 'When the car was added')`,
        [id, garageToday(), v.mileageKm])
    return id
  })
}

/** Same as `values`, except Rental cars keep their odometer and next service: Maintenance owns those. */
const updateValues = `:plate, :make, :model, :variant, :year, :color, :vin, :engineNumber, :buildDate,
  :complianceDate, :engineType, :cylinders, :fuelType, :transmission, :bodyStyle, :radioPin,
  CASE purpose WHEN 'rental' THEN mileage_km ELSE :mileageKm END,
  CASE purpose WHEN 'rental' THEN next_service_date ELSE :nextServiceDate END,
  CASE purpose WHEN 'rental' THEN next_service_km ELSE :nextServiceKm END,
  :nextTransmissionDate, :nextTransmissionKm, :regoExpiry,
  :insuranceProvider, :insurancePolicy, :insuranceExpiry, :ppsrChecked, :writtenOff, :notes`

export async function updateCar(id: number, v: CarValues) {
  const { changes } = await db.run(
    `UPDATE cars SET (${fields}, updated_at) = (${updateValues}, ${sqlNow}) WHERE id = :id`, { ...toParams(v), id },
  )
  return changes > 0
}

export async function deleteCar(id: number) {
  return (await db.run(`DELETE FROM cars WHERE id = ?`, [id])).changes > 0
}

/**
 * Vehicle choices for the fine, toll and transaction forms. `holderId` is the
 * Customer with the car right now (active Rental or Finance Sale), so a new
 * fine can be passed on to them.
 */
export function carOptions() {
  return db.all<{ id: number; plate: string; name: string; holderId: number | null }>(
    `SELECT car.id, car.plate, (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS name,
       coalesce(
         (SELECT r.customer_id FROM rentals r WHERE r.car_id = car.id AND r.status = 'active'),
         (SELECT f.customer_id FROM finance_sales f WHERE f.car_id = car.id AND f.status = 'active')
       ) AS holderId
     FROM cars car ORDER BY car.plate`,
  )
}

// ---- Stock -------------------------------------------------------------------

const isManual = (status: CarStatus) => (MANUAL_CAR_STATUSES as readonly string[]).includes(status)

/**
 * Saves the Stock tab. Staff may only move a car between Preparation and Ready;
 * Rented, Under finance and Sold belong to Rentals and Finance Sales. Only the
 * prices that apply to the car's purpose are written.
 */
export async function updateCarStock(id: number, v: CarStockValues): Promise<'ok' | 'not_found' | 'status_locked'> {
  const current = await db.get<{ status: CarStatus }>('SELECT status FROM cars WHERE id = ?', [id])
  if (!current) return 'not_found'
  if (v.status !== undefined && v.status !== current.status && !isManual(current.status)) return 'status_locked'
  await db.run(
    `UPDATE cars SET status = coalesce(:status, status),
       weekly_rate_cents  = CASE purpose WHEN 'rental' THEN :weeklyRate  ELSE weekly_rate_cents  END,
       asking_price_cents = CASE purpose WHEN 'sale'   THEN :askingPrice ELSE asking_price_cents END,
       min_price_cents    = CASE purpose WHEN 'sale'   THEN :minPrice    ELSE min_price_cents    END,
       mileage_km = CASE purpose WHEN 'rental' THEN mileage_km ELSE :mileageKm END, listing_description = :listingDescription, features = :features,
       updated_at = ${sqlNow}
     WHERE id = :id`, {
    id,
    status: v.status ?? null,
    weeklyRate: toCents(v.weeklyRate),
    askingPrice: toCents(v.askingPrice),
    minPrice: toCents(v.minPrice),
    mileageKm: v.mileageKm,
    listingDescription: v.listingDescription,
    features: v.features.join(','),
  })
  return 'ok'
}

export type StockItem = Pick<
  Car,
  | 'id' | 'purpose' | 'status' | 'plate' | 'make' | 'model' | 'variant' | 'year' | 'color' | 'bodyStyle' | 'transmission'
  | 'fuelType' | 'mileageKm' | 'weeklyRateCents' | 'askingPriceCents' | 'minPriceCents'
  | 'regoExpiry' | 'insuranceExpiry' | 'ppsrChecked' | 'writtenOff' | 'createdAt'
> &
  Totals

type StockFlag = 'ppsrChecked' | 'writtenOff'
type StockRow = Omit<StockItem, StockFlag | 'pnlCents' | 'roi'> & Record<StockFlag, number>

const stockOrder = {
  longest: 'car.created_at ASC, car.id ASC',
  value: 'coalesce(car.asking_price_cents, car.weekly_rate_cents * 52, 0) DESC, car.plate',
  rego: 'car.plate COLLATE NOCASE',
} as const

/** Cars with their ledger totals, for the Stock board and table. */
export async function listStock({ purpose, sort, q }: z.output<typeof stockSearchSchema>) {
  const conditions = ['1 = 1']
  const params: Record<string, string> = {}
  if (purpose !== 'all') {
    conditions.push('car.purpose = :purpose')
    params.purpose = purpose
  }
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR car.make LIKE :like ESCAPE '\\' OR car.model LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  const rows = await db.all<StockRow>(
      `SELECT car.id, car.purpose, car.status, car.plate, car.make, car.model, car.variant, car.year, car.color,
              car.body_style AS bodyStyle, car.transmission, car.fuel_type AS fuelType, car.mileage_km AS mileageKm,
              car.weekly_rate_cents AS weeklyRateCents, car.asking_price_cents AS askingPriceCents, car.min_price_cents AS minPriceCents,
              car.rego_expiry AS regoExpiry, car.insurance_expiry AS insuranceExpiry,
              car.ppsr_checked AS ppsrChecked, car.written_off AS writtenOff, car.created_at AS createdAt,
              ${totalsColumns}
       FROM cars car LEFT JOIN transactions t ON t.car_id = car.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY car.id ORDER BY ${stockOrder[sort]}`,
      params,
  )
  return rows.map(
    (r): StockItem => ({
      ...r,
      ...withPnl(r),
      ppsrChecked: !!r.ppsrChecked,
      writtenOff: !!r.writtenOff,
    }),
  )
}

/** How many cars sit in each status. */
export async function stockStatusCounts() {
  const rows = await db.all<{ status: CarStatus; count: number }>(`SELECT status, COUNT(*) AS count FROM cars GROUP BY status`)
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<CarStatus, number>>
}

/** Cars not yet Sold whose rego or insurance expires on or before `until` (YYYY-MM-DD), soonest first. */
export function expiringCompliance(until: string) {
  return db.all<{ id: number; plate: string; name: string; what: 'rego' | 'insurance'; expiresOn: string }>(
    `SELECT id, plate, (coalesce(year || ' ', '') || make || ' ' || model) AS name, 'rego' AS what, rego_expiry AS expiresOn
     FROM cars WHERE status != 'sold' AND rego_expiry IS NOT NULL AND rego_expiry <= :until
     UNION ALL
     SELECT id, plate, (coalesce(year || ' ', '') || make || ' ' || model), 'insurance', insurance_expiry
     FROM cars WHERE status != 'sold' AND insurance_expiry IS NOT NULL AND insurance_expiry <= :until
     ORDER BY expiresOn`,
    { until },
  )
}
