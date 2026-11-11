import '@tanstack/react-start/server-only'
import { db, likePattern, sqlNow, toCents } from './db.server'
import { totalsColumns, withPnl, type Totals } from './transactions.server'
import type { CarFeature, CarStatus, CarStockValues, CarValues, FuelType, carListSearchSchema, stockSearchSchema } from '~/lib/schemas'
import type { z } from 'zod'

export interface Car {
  id: number
  status: CarStatus
  /** null = owned by the business. */
  customerId: number | null
  ownerName: string | null
  ownerPhone: string | null
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
  forRent: boolean
  weeklyRateCents: number | null
  forSale: boolean
  askingPriceCents: number | null
  minPriceCents: number | null
  listingDescription: string | null
  features: CarFeature[]
  createdAt: string
  updatedAt: string
}
export type CarListItem = Pick<
  Car,
  'id' | 'status' | 'plate' | 'make' | 'model' | 'variant' | 'year' | 'color' | 'customerId' | 'ownerName' | 'createdAt'
>

type Row = Omit<Car, 'ppsrChecked' | 'writtenOff' | 'forRent' | 'forSale' | 'features'> & {
  ppsrChecked: number
  writtenOff: number
  forRent: number
  forSale: number
  features: string
}

const fromRow = (r: Row): Car => ({
  ...r,
  ppsrChecked: !!r.ppsrChecked,
  writtenOff: !!r.writtenOff,
  forRent: !!r.forRent,
  forSale: !!r.forSale,
  features: (r.features ? r.features.split(',') : []) as CarFeature[],
})
const toParams = (v: CarValues) => ({ ...v, ppsrChecked: v.ppsrChecked ? 1 : 0, writtenOff: v.writtenOff ? 1 : 0 })

const ownerName = `(c.first_name || coalesce(' ' || c.last_name, ''))`
const from = `FROM cars car LEFT JOIN customers c ON c.id = car.customer_id`

const listColumns = `car.id, car.status, car.plate, car.make, car.model, car.variant, car.year, car.color,
  car.customer_id AS customerId, ${ownerName} AS ownerName, car.created_at AS createdAt`

const allColumns = `car.id, car.status, car.customer_id AS customerId, ${ownerName} AS ownerName, c.phone AS ownerPhone,
  car.plate, car.make, car.model, car.variant, car.year, car.color, car.vin, car.engine_number AS engineNumber,
  car.build_date AS buildDate, car.compliance_date AS complianceDate, car.engine_type AS engineType, car.cylinders,
  car.fuel_type AS fuelType, car.transmission, car.body_style AS bodyStyle, car.radio_pin AS radioPin,
  car.mileage_km AS mileageKm, car.next_service_date AS nextServiceDate, car.next_service_km AS nextServiceKm,
  car.next_transmission_date AS nextTransmissionDate, car.next_transmission_km AS nextTransmissionKm,
  car.rego_expiry AS regoExpiry, car.insurance_provider AS insuranceProvider, car.insurance_policy AS insurancePolicy,
  car.insurance_expiry AS insuranceExpiry, car.ppsr_checked AS ppsrChecked, car.written_off AS writtenOff,
  car.notes, car.for_rent AS forRent, car.weekly_rate_cents AS weeklyRateCents, car.for_sale AS forSale,
  car.asking_price_cents AS askingPriceCents, car.min_price_cents AS minPriceCents,
  car.listing_description AS listingDescription, car.features,
  car.created_at AS createdAt, car.updated_at AS updatedAt`

const orderBy = {
  recent: 'car.created_at DESC, car.id DESC',
  oldest: 'car.created_at ASC, car.id ASC',
  make_asc: 'car.make COLLATE NOCASE ASC, car.model COLLATE NOCASE ASC, car.year DESC',
  make_desc: 'car.make COLLATE NOCASE DESC, car.model COLLATE NOCASE DESC, car.year DESC',
} as const

export function listCars({ q, page, size, sort, owner }: z.output<typeof carListSearchSchema>) {
  const conditions: string[] = []
  const params: Record<string, string | number> = {}
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR car.make LIKE :like ESCAPE '\\' OR car.model LIKE :like ESCAPE '\\'
      OR car.vin LIKE :like ESCAPE '\\' OR ${ownerName} LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  if (owner === 'business') conditions.push('car.customer_id IS NULL')
  else if (owner !== undefined) {
    conditions.push('car.customer_id = :owner')
    params.owner = owner
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${from} ${where}`).get(params) as { total: number }
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(page, pageCount)
  const items = db
    .prepare(`SELECT ${listColumns} ${from} ${where} ORDER BY ${orderBy[sort]} LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: size, offset: (current - 1) * size }) as unknown as CarListItem[]
  return { items, total, page: current, pageCount }
}

export function carsForCustomer(customerId: number) {
  return db
    .prepare(`SELECT ${listColumns} ${from} WHERE car.customer_id = ? ORDER BY car.plate`)
    .all(customerId) as unknown as CarListItem[]
}

export function getCar(id: number) {
  const row = db.prepare(`SELECT ${allColumns} ${from} WHERE car.id = ?`).get(id) as Row | undefined
  return row ? fromRow(row) : null
}

const fields = `status, customer_id, plate, make, model, variant, year, color, vin, engine_number, build_date,
  compliance_date, engine_type, cylinders, fuel_type, transmission, body_style, radio_pin, mileage_km,
  next_service_date, next_service_km, next_transmission_date, next_transmission_km, rego_expiry,
  insurance_provider, insurance_policy, insurance_expiry, ppsr_checked, written_off, notes`
const values = `:status, :customerId, :plate, :make, :model, :variant, :year, :color, :vin, :engineNumber, :buildDate,
  :complianceDate, :engineType, :cylinders, :fuelType, :transmission, :bodyStyle, :radioPin, :mileageKm,
  :nextServiceDate, :nextServiceKm, :nextTransmissionDate, :nextTransmissionKm, :regoExpiry,
  :insuranceProvider, :insurancePolicy, :insuranceExpiry, :ppsrChecked, :writtenOff, :notes`

export function insertCar(v: CarValues) {
  const { lastInsertRowid } = db.prepare(`INSERT INTO cars (${fields}) VALUES (${values})`).run(toParams(v))
  return Number(lastInsertRowid)
}

export function updateCar(id: number, v: CarValues) {
  const { changes } = db
    .prepare(
      `UPDATE cars SET (${fields}, updated_at) = (${values}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = :id`,
    )
    .run({ ...toParams(v), id })
  return changes > 0
}

export function deleteCar(id: number) {
  return db.prepare(`DELETE FROM cars WHERE id = ?`).run(id).changes > 0
}

/** Compact list for vehicle pickers (fines, tolls, transactions). */
export function carOptions() {
  return db
    .prepare(
      `SELECT car.id, car.plate, (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS name,
              car.customer_id AS customerId
       FROM cars car ORDER BY car.plate`,
    )
    .all() as unknown as { id: number; plate: string; name: string; customerId: number | null }[]
}

// ---- Stock (business-owned cars) ---------------------------------------------

export function updateCarStock(id: number, v: CarStockValues) {
  return (
    db
      .prepare(
        `UPDATE cars SET status = :status, for_rent = :forRent, weekly_rate_cents = :weeklyRate,
           for_sale = :forSale, asking_price_cents = :askingPrice, min_price_cents = :minPrice,
           mileage_km = :mileageKm, listing_description = :listingDescription, features = :features,
           updated_at = ${sqlNow}
         WHERE id = :id`,
      )
      .run({
        ...v,
        id,
        forRent: v.forRent ? 1 : 0,
        forSale: v.forSale ? 1 : 0,
        weeklyRate: toCents(v.weeklyRate),
        askingPrice: toCents(v.askingPrice),
        minPrice: toCents(v.minPrice),
        features: v.features.join(','),
      }).changes > 0
  )
}

export type StockItem = Pick<
  Car,
  | 'id' | 'status' | 'plate' | 'make' | 'model' | 'variant' | 'year' | 'color' | 'bodyStyle' | 'transmission'
  | 'fuelType' | 'mileageKm' | 'forRent' | 'weeklyRateCents' | 'forSale' | 'askingPriceCents' | 'minPriceCents'
  | 'regoExpiry' | 'insuranceExpiry' | 'ppsrChecked' | 'writtenOff' | 'createdAt'
> &
  Totals

type StockFlag = 'forRent' | 'forSale' | 'ppsrChecked' | 'writtenOff'
type StockRow = Omit<StockItem, StockFlag | 'pnlCents' | 'roi'> & Record<StockFlag, number>

const stockOrder = {
  longest: 'car.created_at ASC, car.id ASC',
  value: 'coalesce(car.asking_price_cents, car.weekly_rate_cents * 52, 0) DESC, car.plate',
  rego: 'car.plate COLLATE NOCASE',
} as const

/** Business-owned cars with their ledger totals, for the Stock board and table. */
export function listStock({ offered, sort, q }: z.output<typeof stockSearchSchema>) {
  const conditions = ['car.customer_id IS NULL']
  const params: Record<string, string> = {}
  if (offered === 'sale') conditions.push('car.for_sale = 1')
  if (offered === 'rent') conditions.push('car.for_rent = 1')
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR car.make LIKE :like ESCAPE '\\' OR car.model LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  const rows = db
    .prepare(
      `SELECT car.id, car.status, car.plate, car.make, car.model, car.variant, car.year, car.color,
              car.body_style AS bodyStyle, car.transmission, car.fuel_type AS fuelType, car.mileage_km AS mileageKm,
              car.for_rent AS forRent, car.weekly_rate_cents AS weeklyRateCents, car.for_sale AS forSale,
              car.asking_price_cents AS askingPriceCents, car.min_price_cents AS minPriceCents,
              car.rego_expiry AS regoExpiry, car.insurance_expiry AS insuranceExpiry,
              car.ppsr_checked AS ppsrChecked, car.written_off AS writtenOff, car.created_at AS createdAt,
              ${totalsColumns}
       FROM cars car LEFT JOIN transactions t ON t.car_id = car.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY car.id ORDER BY ${stockOrder[sort]}`,
    )
    .all(params) as unknown as StockRow[]
  return rows.map(
    (r): StockItem => ({
      ...r,
      ...withPnl(r),
      forRent: !!r.forRent,
      forSale: !!r.forSale,
      ppsrChecked: !!r.ppsrChecked,
      writtenOff: !!r.writtenOff,
    }),
  )
}

/** How many business-owned cars sit in each status. */
export function stockStatusCounts() {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS count FROM cars WHERE customer_id IS NULL GROUP BY status`)
    .all() as unknown as { status: CarStatus; count: number }[]
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<CarStatus, number>>
}

/** Fleet cars whose rego or insurance expires on or before `until` (YYYY-MM-DD), soonest first. */
export function expiringCompliance(until: string) {
  return db
    .prepare(
      `SELECT id, plate, (coalesce(year || ' ', '') || make || ' ' || model) AS name, 'rego' AS what, rego_expiry AS expiresOn
       FROM cars WHERE customer_id IS NULL AND status != 'sold' AND rego_expiry IS NOT NULL AND rego_expiry <= :until
       UNION ALL
       SELECT id, plate, (coalesce(year || ' ', '') || make || ' ' || model), 'insurance', insurance_expiry
       FROM cars WHERE customer_id IS NULL AND status != 'sold' AND insurance_expiry IS NOT NULL AND insurance_expiry <= :until
       ORDER BY expiresOn`,
    )
    .all({ until }) as unknown as { id: number; plate: string; name: string; what: 'rego' | 'insurance'; expiresOn: string }[]
}
