import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import type {
  ChargeKind, DeductionKind, PaymentMethod, RentChangeValues, RentPaymentValues, RentalStatus, ReturnRentalValues,
  StartRentalValues, rentalListSearchSchema,
} from '~/lib/schemas'
import { nextDueDate, rateOn, rentDue, settle, weeksBehind, type RentRate } from '~/lib/rent'
import { db, inTransaction, likePattern, sqlNow, toCents } from './db.server'
import { resolveInlineCustomer } from './customers.server'

// Rentals (SPECs/rentals.md). A Rental is open-ended: Bond at the start, then
// weekly Rent in advance until the Return. Money lives in the transactions
// ledger (rental_income, bond_received / bond_returned / bond_applied rows
// carrying rental_id); this module derives Arrears and the Bond held from it.

export interface Rental {
  id: number
  customerId: number
  customerName: string
  customerPhone: string
  carId: number
  carPlate: string
  carName: string
  startDate: string
  bondCents: number
  status: RentalStatus
  returnedOn: string | null
  returnReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface RentalSummary {
  /** Rent in effect today (or on the Return date). */
  weeklyCents: number
  rentDueCents: number
  rentPaidCents: number
  /** Rent due − Rent paid; negative when paid ahead. */
  arrearsCents: number
  /** What the Customer owes on this Rental now: Arrears while active, the unpaid shortfall after Return. */
  owedCents: number
  weeksBehind: number
  nextDueOn: string | null
  bondHeldCents: number
  bondAppliedCents: number
}

export type RentalWithSummary = Rental & RentalSummary

export interface RentalPayment {
  id: number
  occurredOn: string
  category: 'rental_income' | 'bond_received' | 'bond_returned' | 'bond_applied'
  amountCents: number
  method: PaymentMethod | null
  notes: string | null
}

export interface RentalDeduction {
  id: number
  kind: DeductionKind
  amountCents: number
  description: string
  chargeId: number | null
}

export interface SuggestedCharge {
  id: number
  kind: ChargeKind
  incurredOn: string
  amountCents: number
  description: string
}

export interface SettlementPreview {
  returnedOn: string
  bondHeldCents: number
  /** Arrears as of the Return date (0 if paid ahead). Always deducted. */
  rentArrearsCents: number
  charges: SuggestedCharge[]
}

const columns = `r.id, r.customer_id AS customerId, (c.first_name || coalesce(' ' || c.last_name, '')) AS customerName,
  c.phone AS customerPhone, r.car_id AS carId, car.plate AS carPlate,
  (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS carName,
  r.start_date AS startDate, r.bond_cents AS bondCents, r.status, r.returned_on AS returnedOn,
  r.return_reason AS returnReason, r.notes, r.created_at AS createdAt, r.updated_at AS updatedAt`
const from = `FROM rentals r JOIN customers c ON c.id = r.customer_id JOIN cars car ON car.id = r.car_id`

// ---- Summaries ---------------------------------------------------------------

interface Money {
  rentPaidCents: number
  bondReceivedCents: number
  bondReturnedCents: number
  bondAppliedCents: number
  otherDeductionsCents: number
}

const noMoney: Money = { rentPaidCents: 0, bondReceivedCents: 0, bondReturnedCents: 0, bondAppliedCents: 0, otherDeductionsCents: 0 }

/** Rates and money for a set of rentals, keyed by rental id. */
async function loadFacts(ids: number[]) {
  const rates = new Map<number, RentRate[]>()
  const money = new Map<number, Money>()
  if (ids.length === 0) return { rates, money }
  const list = ids.join(',') // integers from our own rows
  for (const r of await db.all<RentRate & { rentalId: number }>(
    `SELECT rental_id AS rentalId, effective_from AS effectiveFrom, weekly_cents AS weeklyCents
     FROM rental_rent_rates WHERE rental_id IN (${list}) ORDER BY effective_from`,
  )) {
    rates.set(r.rentalId, [...(rates.get(r.rentalId) ?? []), { effectiveFrom: r.effectiveFrom, weeklyCents: r.weeklyCents }])
  }
  for (const m of await db.all<Omit<Money, 'otherDeductionsCents'> & { rentalId: number }>(
    `SELECT rental_id AS rentalId,
                coalesce(SUM(CASE WHEN category = 'rental_income' THEN amount_cents END), 0) AS rentPaidCents,
                coalesce(SUM(CASE WHEN category = 'bond_received' THEN amount_cents END), 0) AS bondReceivedCents,
                coalesce(SUM(CASE WHEN category = 'bond_returned' THEN amount_cents END), 0) AS bondReturnedCents,
                coalesce(SUM(CASE WHEN category = 'bond_applied' THEN amount_cents END), 0) AS bondAppliedCents
              FROM transactions WHERE rental_id IN (${list}) GROUP BY rental_id`,
  )) {
    money.set(m.rentalId, { ...m, otherDeductionsCents: 0 })
  }
  for (const d of await db.all<{ rentalId: number; cents: number }>(
    `SELECT rental_id AS rentalId, SUM(amount_cents) AS cents FROM rental_deductions
     WHERE rental_id IN (${list}) AND kind != 'rent_arrears' GROUP BY rental_id`,
  )) {
    money.set(d.rentalId, { ...(money.get(d.rentalId) ?? noMoney), otherDeductionsCents: d.cents })
  }
  return { rates, money }
}

/**
 * The account for one Rental. What's owed = Rent due + non-rent deductions −
 * Rent paid − Bond kept, so it reads as Arrears while active and as the
 * unpaid shortfall after Return (payments towards it are rental_income too).
 */
function summarise(r: Rental, rates: RentRate[], m: Money, today: string): RentalSummary {
  const asOf = r.returnedOn && r.returnedOn < today ? r.returnedOn : today
  const due = rentDue(rates, r.startDate, today, r.returnedOn)
  const weeklyCents = rateOn(rates, asOf)
  const owedCents = due + m.otherDeductionsCents - m.rentPaidCents - m.bondAppliedCents
  return {
    weeklyCents,
    rentDueCents: due,
    rentPaidCents: m.rentPaidCents,
    arrearsCents: due - m.rentPaidCents,
    owedCents,
    weeksBehind: weeksBehind(owedCents, weeklyCents),
    nextDueOn: nextDueDate(r.startDate, today, r.returnedOn),
    bondHeldCents: m.bondReceivedCents - m.bondReturnedCents - m.bondAppliedCents,
    bondAppliedCents: m.bondAppliedCents,
  }
}

async function withSummaries(rentals: Rental[], today: string): Promise<RentalWithSummary[]> {
  const { rates, money } = await loadFacts(rentals.map((r) => r.id))
  return rentals.map((r) => ({ ...r, ...summarise(r, rates.get(r.id) ?? [], money.get(r.id) ?? noMoney, today) }))
}

// ---- Reads -------------------------------------------------------------------

export async function getRental(id: number, today: string) {
  const row = await db.get<Rental>(`SELECT ${columns} ${from} WHERE r.id = ?`, [id])
  if (!row) return null
  const [rental] = await withSummaries([row], today)
  const rates = await db.all<RentRate>(
    `SELECT effective_from AS effectiveFrom, weekly_cents AS weeklyCents FROM rental_rent_rates
     WHERE rental_id = ? ORDER BY effective_from`, [id],
  )
  const payments = await db.all<RentalPayment>(
    `SELECT id, occurred_on AS occurredOn, category, amount_cents AS amountCents, method, notes
     FROM transactions WHERE rental_id = ? ORDER BY occurred_on DESC, id DESC`, [id],
  )
  const deductions = await db.all<RentalDeduction>(
    `SELECT id, kind, amount_cents AS amountCents, description, charge_id AS chargeId
     FROM rental_deductions WHERE rental_id = ? ORDER BY id`, [id],
  )
  return { rental: rental!, rates, payments, deductions }
}

/**
 * Rentals for the list page. Arrears depend on the Rent schedule, so filtering
 * on "behind" and sorting by Arrears happen after the summaries are worked out.
 */
export async function listRentals({ q, status, show, sort }: z.output<typeof rentalListSearchSchema>, today: string) {
  const conditions: string[] = []
  const params: Record<string, string> = {}
  if (status !== 'all') {
    conditions.push('r.status = :status')
    params.status = status
  }
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR car.make LIKE :like ESCAPE '\\' OR car.model LIKE :like ESCAPE '\\'
      OR (c.first_name || coalesce(' ' || c.last_name, '')) LIKE :like ESCAPE '\\' OR c.phone LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await db.all<Rental>(`SELECT ${columns} ${from} ${where}`, params)
  let items = await withSummaries(rows, today)
  if (show === 'behind') items = items.filter((r) => r.owedCents > 0)
  const byStart = (a: Rental, b: Rental) => b.startDate.localeCompare(a.startDate) || b.id - a.id
  items.sort(
    sort === 'arrears' ? (a, b) => b.owedCents - a.owedCents || byStart(a, b)
      : sort === 'start' ? (a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id
        : byStart,
  )
  return items
}

const activeFirst = (rows: RentalWithSummary[]) =>
  rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) || b.startDate.localeCompare(a.startDate) || b.id - a.id)

export async function rentalsForCustomer(customerId: number, today: string) {
  const rows = await db.all<Rental>(`SELECT ${columns} ${from} WHERE r.customer_id = ?`, [customerId])
  return activeFirst(await withSummaries(rows, today))
}

export async function rentalsForCar(carId: number, today: string) {
  const rows = await db.all<Rental>(`SELECT ${columns} ${from} WHERE r.car_id = ?`, [carId])
  return activeFirst(await withSummaries(rows, today))
}

/** Ready Rental cars, for the "Start rental" picker. */
export function availableRentalCars() {
  return db.all<{ id: number; plate: string; name: string; weeklyRateCents: number | null }>(
    `SELECT car.id, car.plate, (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS name,
       car.weekly_rate_cents AS weeklyRateCents
     FROM cars car WHERE car.purpose = 'rental' AND car.status = 'ready' ORDER BY car.plate`,
  )
}

/** Customers for the "Start rental" picker, with whether a licence photo is on file. */
export async function rentalCustomerOptions() {
  const rows = await db.all<{ id: number; name: string; phone: string; hasLicence: number }>(
    `SELECT c.id, (c.first_name || coalesce(' ' || c.last_name, '')) AS name, c.phone,
       EXISTS (SELECT 1 FROM customer_documents d WHERE d.customer_id = c.id AND d.kind = 'licence_front') AS hasLicence
     FROM customers c ORDER BY c.first_name COLLATE NOCASE, c.last_name COLLATE NOCASE`,
  )
  return rows.map((r) => ({ ...r, hasLicence: !!r.hasLicence }))
}

// ---- Writes ------------------------------------------------------------------

export type StartOutcome = { ok: true; id: number } | { ok: false; reason: 'car_not_available' | 'customer_not_found' }

/**
 * Starts a Rental: (optionally) creates the Customer, records the Rental, its
 * first Rent rate and the Bond received, and moves the Car to Rented, all or
 * nothing. Only a Ready Rental car can be rented.
 */
export function startRental(v: StartRentalValues): Promise<StartOutcome> {
  return inTransaction(async (): Promise<StartOutcome> => {
    const car = await db.get<{ purpose: string; status: string }>(`SELECT purpose, status FROM cars WHERE id = ?`, [v.carId])
    if (!car || car.purpose !== 'rental' || car.status !== 'ready') return { ok: false, reason: 'car_not_available' }

    const customerId = await resolveInlineCustomer(v)
    if (customerId == null) return { ok: false, reason: 'customer_not_found' }

    const bondCents = toCents(v.bond) ?? 0
    const { lastInsertRowid: id } = await db.run(
      `INSERT INTO rentals (customer_id, car_id, start_date, bond_cents, notes) VALUES (?, ?, ?, ?, ?)`,
      [customerId, v.carId, v.startDate, bondCents, v.notes],
    )
    await db.run(`INSERT INTO rental_rent_rates (rental_id, effective_from, weekly_cents) VALUES (?, ?, ?)`,
      [id, v.startDate, toCents(v.weeklyRent)])
    if (bondCents > 0) {
      await db.run(`INSERT INTO transactions (car_id, customer_id, rental_id, occurred_on, category, amount_cents, method, notes)
                    VALUES (?, ?, ?, ?, 'bond_received', ?, ?, 'Bond at rental start')`,
        [v.carId, customerId, id, v.startDate, bondCents, v.bondMethod])
    }
    await db.run(`UPDATE cars SET status = 'rented', updated_at = ${sqlNow} WHERE id = ?`, [v.carId])
    return { ok: true, id }
  })
}

function rentalRow(id: number) {
  return db.get<{ id: number; customerId: number; carId: number; startDate: string; status: RentalStatus }>(
    `SELECT id, customer_id AS customerId, car_id AS carId, start_date AS startDate, status FROM rentals WHERE id = ?`, [id],
  )
}

/** A Rent payment of any amount (also used to pay off a shortfall after Return). */
export async function recordRentPayment(id: number, v: RentPaymentValues): Promise<'ok' | 'not_found'> {
  const r = await rentalRow(id)
  if (!r) return 'not_found'
  await db.run(`INSERT INTO transactions (car_id, customer_id, rental_id, occurred_on, category, amount_cents, method, notes)
                VALUES (?, ?, ?, ?, 'rental_income', ?, ?, ?)`,
    [r.carId, r.customerId, id, v.paidOn, toCents(v.amount), v.method, v.notes])
  return 'ok'
}

/** Changes the weekly Rent from a date. Earlier weeks keep their rate; the same date again replaces it. */
export function adjustRent(id: number, v: RentChangeValues): Promise<'ok' | 'not_found' | 'not_active' | 'before_start'> {
  return inTransaction(async () => {
    const r = await rentalRow(id)
    if (!r) return 'not_found'
    if (r.status !== 'active') return 'not_active'
    if (v.effectiveFrom < r.startDate) return 'before_start'
    await db.run(`INSERT INTO rental_rent_rates (rental_id, effective_from, weekly_cents) VALUES (?, ?, ?)
                  ON CONFLICT (rental_id, effective_from) DO UPDATE SET weekly_cents = excluded.weekly_cents`,
      [id, v.effectiveFrom, toCents(v.weeklyRent)])
    await db.run(`UPDATE rentals SET updated_at = ${sqlNow} WHERE id = ?`, [id])
    return 'ok'
  })
}

/**
 * Fines and tolls to suggest at Return: unpaid or business-paid, on this Car,
 * dated within the Rental, and either this Customer's or not yet assigned.
 */
function suggestedCharges(r: { carId: number; customerId: number; startDate: string }, returnedOn: string) {
  return db.all<SuggestedCharge>(
    `SELECT id, kind, incurred_on AS incurredOn, amount_cents AS amountCents,
                trim(coalesce(offence_type, '') || coalesce(' · #' || notice_number, '')) AS description
              FROM charges
              WHERE car_id = :car AND (customer_id = :customer OR customer_id IS NULL)
                AND incurred_on BETWEEN :start AND :end AND status IN ('not_paid', 'business_paid')
                AND amount_cents > 0
              ORDER BY incurred_on, id`,
    { car: r.carId, customer: r.customerId, start: r.startDate, end: returnedOn },
  )
}

async function arrearsAt(id: number, startDate: string, returnedOn: string) {
  const rates = (await loadFacts([id])).rates.get(id) ?? []
  const { rentPaidCents } = (await db.get<{ rentPaidCents: number }>(
    `SELECT coalesce(SUM(amount_cents), 0) AS rentPaidCents FROM transactions
     WHERE rental_id = ? AND category = 'rental_income'`, [id],
  ))!
  return Math.max(0, rentDue(rates, startDate, returnedOn, returnedOn) - rentPaidCents)
}

async function bondHeld(id: number) {
  return (await db.get<{ held: number }>(
    `SELECT coalesce(SUM(CASE WHEN category = 'bond_received' THEN amount_cents ELSE -amount_cents END), 0) AS held
     FROM transactions WHERE rental_id = ? AND category IN ('bond_received', 'bond_returned', 'bond_applied')`, [id],
  ))!.held
}

export async function settlementPreview(id: number, returnedOn: string): Promise<SettlementPreview | 'not_found' | 'not_active'> {
  const r = await rentalRow(id)
  if (!r) return 'not_found'
  if (r.status !== 'active') return 'not_active'
  const end = returnedOn < r.startDate ? r.startDate : returnedOn
  return {
    returnedOn: end,
    bondHeldCents: await bondHeld(id),
    rentArrearsCents: await arrearsAt(id, r.startDate, end),
    charges: await suggestedCharges(r, end),
  }
}

export type ReturnOutcome =
  | { ok: true; refundCents: number; shortfallCents: number; appliedCents: number }
  | { ok: false; reason: 'not_found' | 'not_active' | 'before_start' }

/**
 * Returns the Car and settles the Bond in one transaction: records the
 * deductions (Arrears always, the chosen fines / tolls, damage), keeps that much
 * of the Bond (bond_applied), refunds the rest (bond_returned), marks the
 * charges paid by the Customer, closes the Rental and puts the Car back in
 * Preparation. Whatever the Bond doesn't cover stays owed on the Rental.
 */
export function returnRental(id: number, v: ReturnRentalValues): Promise<ReturnOutcome> {
  return inTransaction(async (): Promise<ReturnOutcome> => {
    const r = await rentalRow(id)
    if (!r) return { ok: false, reason: 'not_found' }
    if (r.status !== 'active') return { ok: false, reason: 'not_active' }
    if (v.returnedOn < r.startDate) return { ok: false, reason: 'before_start' }

    const deductions: { kind: DeductionKind; amountCents: number; description: string; chargeId: number | null }[] = []
    const arrears = await arrearsAt(id, r.startDate, v.returnedOn)
    if (arrears > 0) deductions.push({ kind: 'rent_arrears', amountCents: arrears, description: 'Rent arrears at return', chargeId: null })
    const wanted = new Set(v.chargeIds)
    const charges = (await suggestedCharges(r, v.returnedOn)).filter((c) => wanted.has(c.id))
    for (const c of charges) {
      deductions.push({
        kind: c.kind,
        amountCents: c.amountCents,
        description: `${c.kind === 'fine' ? 'Fine' : 'Toll'} ${c.incurredOn}${c.description ? ` · ${c.description}` : ''}`,
        chargeId: c.id,
      })
    }
    for (const e of v.extras) deductions.push({ kind: e.kind, amountCents: toCents(e.amount)!, description: e.description, chargeId: null })

    for (const d of deductions)
      await db.run(`INSERT INTO rental_deductions (rental_id, kind, amount_cents, description, charge_id) VALUES (?, ?, ?, ?, ?)`,
        [id, d.kind, d.amountCents, d.description, d.chargeId])

    const total = deductions.reduce((s, d) => s + d.amountCents, 0)
    const { appliedCents, refundCents, shortfallCents } = settle(await bondHeld(id), total)
    const ledger = (category: string, cents: number, method: PaymentMethod | null, notes: string) =>
      db.run(`INSERT INTO transactions (car_id, customer_id, rental_id, occurred_on, category, amount_cents, method, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [r.carId, r.customerId, id, v.returnedOn, category, cents, method, notes])
    if (appliedCents > 0) await ledger('bond_applied', appliedCents, null, 'Bond kept at return')
    if (refundCents > 0) await ledger('bond_returned', refundCents, v.refundMethod, 'Bond refund at return')

    for (const c of charges)
      await db.run(`UPDATE charges SET status = 'paid_by_customer', customer_id = ?, updated_at = ${sqlNow} WHERE id = ?`,
        [r.customerId, c.id])

    await db.run(`UPDATE rentals SET status = 'returned', returned_on = ?, return_reason = ?, updated_at = ${sqlNow} WHERE id = ?`,
      [v.returnedOn, v.reason, id])
    await db.run(`UPDATE cars SET status = 'preparation', updated_at = ${sqlNow} WHERE id = ?`, [r.carId])
    return { ok: true, appliedCents, refundCents, shortfallCents }
  })
}
