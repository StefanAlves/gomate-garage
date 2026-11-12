import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import type {
  DefaultFinanceSaleValues, FinanceStatus, PaymentMethod, RentPaymentValues, StartFinanceSaleValues, financeListSearchSchema,
} from '~/lib/schemas'
import {
  dueToDate, financePlan, financeSchedule, nextFinanceDue, scheduleWithState, type FinancePlan, type ScheduleRow,
} from '~/lib/finance'
import { weeksBehind } from '~/lib/rent'
import { db, inTransaction, likePattern, sqlNow, toCents } from './db.server'
import { resolveInlineCustomer } from './customers.server'

// Finance Sales (SPECs/finance-sales.md): a Deposit then n weekly Instalments
// for a Sale car. The garage owns the car until the total paid reaches the
// price; that payment completes the sale and makes the car Sold. Payments are
// sale_income rows in the ledger carrying finance_sale_id.

export interface FinanceSale {
  id: number
  customerId: number
  customerName: string
  customerPhone: string
  carId: number
  carPlate: string
  carName: string
  agreedOn: string
  priceCents: number
  depositCents: number
  instalmentCount: number
  instalmentCents: number
  status: FinanceStatus
  closedOn: string | null
  defaultReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface FinanceSummary {
  lastInstalmentCents: number
  paidCents: number
  balanceCents: number
  dueToDateCents: number
  /** Due to date − paid; negative when paid ahead. */
  arrearsCents: number
  weeksBehind: number
  nextDueOn: string | null
  overdue: boolean
}

export type FinanceSaleWithSummary = FinanceSale & FinanceSummary

export interface FinancePayment {
  id: number
  occurredOn: string
  amountCents: number
  method: PaymentMethod | null
  notes: string | null
}

const columns = `f.id, f.customer_id AS customerId, (c.first_name || coalesce(' ' || c.last_name, '')) AS customerName,
  c.phone AS customerPhone, f.car_id AS carId, car.plate AS carPlate,
  (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS carName,
  f.agreed_on AS agreedOn, f.price_cents AS priceCents, f.deposit_cents AS depositCents,
  f.instalment_count AS instalmentCount, f.instalment_cents AS instalmentCents, f.status, f.closed_on AS closedOn,
  f.default_reason AS defaultReason, f.notes, f.created_at AS createdAt, f.updated_at AS updatedAt`
const from = `FROM finance_sales f JOIN customers c ON c.id = f.customer_id JOIN cars car ON car.id = f.car_id`

const planOf = (f: Pick<FinanceSale, 'priceCents' | 'depositCents' | 'instalmentCount' | 'instalmentCents'>): FinancePlan => ({
  instalmentCents: f.instalmentCents,
  lastCents: f.instalmentCount === 0 ? 0 : f.priceCents - f.depositCents - (f.instalmentCount - 1) * f.instalmentCents,
})

export const scheduleOf = (f: FinanceSale): ScheduleRow[] =>
  financeSchedule(f.agreedOn, f.depositCents, f.instalmentCount, planOf(f))

function paidBySale(ids: number[]) {
  const out = new Map<number, number>()
  if (ids.length === 0) return out
  for (const r of db
    .prepare(`SELECT finance_sale_id AS id, SUM(amount_cents) AS cents FROM transactions
              WHERE category = 'sale_income' AND finance_sale_id IN (${ids.join(',')}) GROUP BY finance_sale_id`)
    .all() as unknown as { id: number; cents: number }[])
    out.set(r.id, r.cents)
  return out
}

/** Arrears freeze when the sale closes; after a Default nothing more falls due. */
function summarise(f: FinanceSale, paidCents: number, today: string): FinanceSummary {
  const asOf = f.closedOn && f.closedOn < today ? f.closedOn : today
  const schedule = scheduleOf(f)
  const due = dueToDate(schedule, asOf)
  const arrearsCents = f.status === 'completed' ? 0 : due - paidCents
  const active = f.status === 'active'
  return {
    lastInstalmentCents: planOf(f).lastCents,
    paidCents,
    balanceCents: f.priceCents - paidCents,
    dueToDateCents: due,
    arrearsCents,
    weeksBehind: weeksBehind(arrearsCents, f.instalmentCents || f.priceCents),
    nextDueOn: active ? nextFinanceDue(schedule, today) : null,
    overdue: active && arrearsCents > 0,
  }
}

function withSummaries(rows: FinanceSale[], today: string): FinanceSaleWithSummary[] {
  const paid = paidBySale(rows.map((r) => r.id))
  return rows.map((f) => ({ ...f, ...summarise(f, paid.get(f.id) ?? 0, today) }))
}

// ---- Reads -------------------------------------------------------------------

export function getFinanceSale(id: number, today: string) {
  const row = db.prepare(`SELECT ${columns} ${from} WHERE f.id = ?`).get(id) as FinanceSale | undefined
  if (!row) return null
  const [sale] = withSummaries([row], today)
  const asOf = row.closedOn && row.closedOn < today ? row.closedOn : today
  const payments = db
    .prepare(`SELECT id, occurred_on AS occurredOn, amount_cents AS amountCents, method, notes FROM transactions
              WHERE finance_sale_id = ? AND category = 'sale_income' ORDER BY occurred_on DESC, id DESC`)
    .all(id) as unknown as FinancePayment[]
  return { sale: sale!, schedule: scheduleWithState(scheduleOf(row), sale!.paidCents, asOf), payments }
}

export function listFinanceSales({ q, status, show, sort }: z.output<typeof financeListSearchSchema>, today: string) {
  const conditions: string[] = []
  const params: Record<string, string> = {}
  if (status !== 'all') {
    conditions.push('f.status = :status')
    params.status = status
  }
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR car.make LIKE :like ESCAPE '\\' OR car.model LIKE :like ESCAPE '\\'
      OR (c.first_name || coalesce(' ' || c.last_name, '')) LIKE :like ESCAPE '\\' OR c.phone LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  let items = withSummaries(db.prepare(`SELECT ${columns} ${from} ${where}`).all(params) as unknown as FinanceSale[], today)
  if (show === 'overdue') items = items.filter((f) => f.overdue)
  const byStart = (a: FinanceSale, b: FinanceSale) => b.agreedOn.localeCompare(a.agreedOn) || b.id - a.id
  items.sort(
    sort === 'arrears' ? (a, b) => b.arrearsCents - a.arrearsCents || byStart(a, b)
      : sort === 'start' ? (a, b) => a.agreedOn.localeCompare(b.agreedOn) || a.id - b.id
        : byStart,
  )
  return items
}

const activeFirst = (rows: FinanceSaleWithSummary[]) =>
  rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0)
    || b.agreedOn.localeCompare(a.agreedOn) || b.id - a.id)

export function financeSalesForCustomer(customerId: number, today: string) {
  const rows = db.prepare(`SELECT ${columns} ${from} WHERE f.customer_id = ?`).all(customerId) as unknown as FinanceSale[]
  return activeFirst(withSummaries(rows, today))
}

/** Every Finance Sale of a car (one active at most; earlier ones were defaulted). */
export function financeSalesForCar(carId: number, today: string) {
  const rows = db.prepare(`SELECT ${columns} ${from} WHERE f.car_id = ?`).all(carId) as unknown as FinanceSale[]
  return activeFirst(withSummaries(rows, today))
}

/** Overview tile: active Finance Sales behind on payments, and what they owe. */
export function overdueFinanceSales(today: string) {
  const overdue = listFinanceSales({ status: 'active', show: 'overdue', sort: 'arrears' }, today)
  return { count: overdue.length, arrearsCents: overdue.reduce((s, f) => s + f.arrearsCents, 0) }
}

/** Ready Sale cars for the "Start finance sale" picker. */
export function availableSaleCars() {
  return db
    .prepare(`SELECT car.id, car.plate, (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS name,
                car.asking_price_cents AS askingPriceCents
              FROM cars car WHERE car.purpose = 'sale' AND car.status = 'ready' ORDER BY car.plate`)
    .all() as unknown as { id: number; plate: string; name: string; askingPriceCents: number | null }[]
}

// ---- Writes ------------------------------------------------------------------

export type StartOutcome =
  | { ok: true; id: number; completed: boolean }
  | { ok: false; reason: 'car_not_available' | 'customer_not_found' | 'invalid_plan' }

/**
 * Starts a Finance Sale: (optionally) creates the Customer, records the deal
 * and the Deposit, and moves the car to Under finance. A cash sale (no
 * Instalments) completes at once and the car becomes Sold.
 */
export function startFinanceSale(v: StartFinanceSaleValues): StartOutcome {
  const priceCents = toCents(v.price)!
  const depositCents = toCents(v.deposit) ?? 0
  const planned = financePlan(priceCents, depositCents, v.instalmentCount, toCents(v.instalmentAmount))
  if (!planned.ok) return { ok: false, reason: 'invalid_plan' }
  return inTransaction((): StartOutcome => {
    const car = db.prepare('SELECT purpose, status FROM cars WHERE id = ?').get(v.carId) as { purpose: string; status: string } | undefined
    if (!car || car.purpose !== 'sale' || car.status !== 'ready') return { ok: false, reason: 'car_not_available' }
    const customerId = resolveInlineCustomer(v)
    if (customerId == null) return { ok: false, reason: 'customer_not_found' }

    const cash = v.instalmentCount === 0
    const id = Number(
      db.prepare(`INSERT INTO finance_sales (customer_id, car_id, agreed_on, price_cents, deposit_cents, instalment_count,
                    instalment_cents, status, closed_on, notes)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(customerId, v.carId, v.agreedOn, priceCents, depositCents, v.instalmentCount, planned.plan.instalmentCents,
          cash ? 'completed' : 'active', cash ? v.agreedOn : null, v.notes).lastInsertRowid,
    )
    if (depositCents > 0) {
      db.prepare(`INSERT INTO transactions (car_id, customer_id, finance_sale_id, occurred_on, category, amount_cents, method, notes)
                  VALUES (?, ?, ?, ?, 'sale_income', ?, ?, ?)`)
        .run(v.carId, customerId, id, v.agreedOn, depositCents, v.depositMethod, cash ? 'Cash sale' : 'Deposit')
    }
    db.prepare(`UPDATE cars SET status = ?, updated_at = ${sqlNow} WHERE id = ?`).run(cash ? 'sold' : 'under_finance', v.carId)
    return { ok: true, id, completed: cash }
  })
}

function saleRow(id: number) {
  return db.prepare(`SELECT id, customer_id AS customerId, car_id AS carId, agreed_on AS agreedOn, price_cents AS priceCents,
                       status FROM finance_sales WHERE id = ?`).get(id) as
    | { id: number; customerId: number; carId: number; agreedOn: string; priceCents: number; status: FinanceStatus } | undefined
}

const paidSoFar = (id: number) => paidBySale([id]).get(id) ?? 0

export type PaymentOutcome =
  | { ok: true; completed: boolean }
  | { ok: false; reason: 'not_found' | 'not_active' }
  | { ok: false; reason: 'overpaid'; balanceCents: number }

/**
 * A payment of any amount up to the remaining balance. The payment that
 * brings the total to the price completes the sale and makes the car Sold.
 */
export function recordFinancePayment(id: number, v: RentPaymentValues): PaymentOutcome {
  return inTransaction((): PaymentOutcome => {
    const f = saleRow(id)
    if (!f) return { ok: false, reason: 'not_found' }
    if (f.status !== 'active') return { ok: false, reason: 'not_active' }
    const amount = toCents(v.amount)!
    const balanceCents = f.priceCents - paidSoFar(id)
    if (amount > balanceCents) return { ok: false, reason: 'overpaid', balanceCents }
    db.prepare(`INSERT INTO transactions (car_id, customer_id, finance_sale_id, occurred_on, category, amount_cents, method, notes)
                VALUES (?, ?, ?, ?, 'sale_income', ?, ?, ?)`)
      .run(f.carId, f.customerId, id, v.paidOn, amount, v.method, v.notes)
    const completed = amount === balanceCents
    if (completed) {
      db.prepare(`UPDATE finance_sales SET status = 'completed', closed_on = ?, updated_at = ${sqlNow} WHERE id = ?`).run(v.paidOn, id)
      db.prepare(`UPDATE cars SET status = 'sold', updated_at = ${sqlNow} WHERE id = ?`).run(f.carId)
    }
    return { ok: true, completed }
  })
}

/** Pays the whole remaining balance (no discount); the sale completes. */
export function payoff(id: number, v: Pick<RentPaymentValues, 'paidOn' | 'method'>): PaymentOutcome {
  const f = saleRow(id)
  if (!f) return { ok: false, reason: 'not_found' }
  const balanceCents = f.priceCents - paidSoFar(id)
  return recordFinancePayment(id, { ...v, amount: balanceCents / 100, notes: 'Payoff' })
}

/** Staff end the sale for non-payment: the car goes back to Preparation and the garage keeps what was paid. */
export function defaultFinanceSale(id: number, v: DefaultFinanceSaleValues): 'ok' | 'not_found' | 'not_active' | 'before_start' {
  return inTransaction(() => {
    const f = saleRow(id)
    if (!f) return 'not_found'
    if (f.status !== 'active') return 'not_active'
    if (v.defaultedOn < f.agreedOn) return 'before_start'
    db.prepare(`UPDATE finance_sales SET status = 'defaulted', closed_on = ?, default_reason = ?, updated_at = ${sqlNow} WHERE id = ?`)
      .run(v.defaultedOn, v.reason, id)
    db.prepare(`UPDATE cars SET status = 'preparation', updated_at = ${sqlNow} WHERE id = ?`).run(f.carId)
    return 'ok'
  })
}

export function updateFinanceNotes(id: number, notes: string | null) {
  return db.prepare(`UPDATE finance_sales SET notes = ?, updated_at = ${sqlNow} WHERE id = ?`).run(notes, id).changes > 0
}
