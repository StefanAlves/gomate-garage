import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import { db, likePattern, sqlNow, toCents } from './db.server'
import { periodRange } from '~/lib/period'
import type { PaymentMethod, Period, TransactionCategory, TransactionValues, transactionListSearchSchema } from '~/lib/schemas'

// Per-car money ledger. Amounts are positive; the category says which way the
// money went. Bonds are tracked but don't count as income, except the part
// kept at a Rental's Return (bond_applied).

export interface Transaction {
  id: number
  carId: number
  carPlate: string
  carName: string
  customerId: number | null
  customerName: string | null
  occurredOn: string
  category: TransactionCategory
  amountCents: number
  method: PaymentMethod | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Totals {
  investedCents: number
  expensesCents: number
  rentalIncomeCents: number
  saleIncomeCents: number
  /** Bond kept against Rental deductions: income, and no longer held. */
  bondAppliedCents: number
  bondHeldCents: number
  /** Income − investment − expenses. */
  pnlCents: number
  /** P&L ÷ (investment + expenses); null when nothing was spent. */
  roi: number | null
}

/** SUM columns for one ledger aggregate; append `FROM transactions t …`. */
export const totalsColumns = `
  coalesce(SUM(CASE WHEN t.category = 'initial_investment' THEN t.amount_cents END), 0) AS investedCents,
  coalesce(SUM(CASE WHEN t.category = 'expense' THEN t.amount_cents END), 0) AS expensesCents,
  coalesce(SUM(CASE WHEN t.category = 'rental_income' THEN t.amount_cents END), 0) AS rentalIncomeCents,
  coalesce(SUM(CASE WHEN t.category = 'sale_income' THEN t.amount_cents END), 0) AS saleIncomeCents,
  coalesce(SUM(CASE WHEN t.category = 'bond_applied' THEN t.amount_cents END), 0) AS bondAppliedCents,
  coalesce(SUM(CASE WHEN t.category = 'bond_received' THEN t.amount_cents
                    WHEN t.category IN ('bond_returned', 'bond_applied') THEN -t.amount_cents END), 0) AS bondHeldCents`

type RawTotals = Omit<Totals, 'pnlCents' | 'roi'>

export function withPnl(r: RawTotals): Totals {
  const spent = r.investedCents + r.expensesCents
  const pnlCents = r.rentalIncomeCents + r.saleIncomeCents + r.bondAppliedCents - spent
  return { ...r, pnlCents, roi: spent > 0 ? pnlCents / spent : null }
}

const columns = `t.id, t.car_id AS carId, car.plate AS carPlate,
  (coalesce(car.year || ' ', '') || car.make || ' ' || car.model) AS carName,
  t.customer_id AS customerId, (c.first_name || coalesce(' ' || c.last_name, '')) AS customerName,
  t.occurred_on AS occurredOn, t.category, t.amount_cents AS amountCents, t.method, t.notes,
  t.created_at AS createdAt, t.updated_at AS updatedAt`
const from = `FROM transactions t JOIN cars car ON car.id = t.car_id LEFT JOIN customers c ON c.id = t.customer_id`

function filters(
  { q, period, car, category, method }: Partial<z.output<typeof transactionListSearchSchema>>,
  today: string,
) {
  const conditions: string[] = []
  const params: Record<string, string | number> = {}
  const range = period ? periodRange(period, today) : null
  if (range) {
    conditions.push('t.occurred_on BETWEEN :from AND :to')
    Object.assign(params, range)
  }
  if (car !== undefined) {
    conditions.push('t.car_id = :car')
    params.car = car
  }
  if (category) {
    conditions.push('t.category = :category')
    params.category = category
  }
  if (method) {
    conditions.push('t.method = :method')
    params.method = method
  }
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR car.make LIKE :like ESCAPE '\\' OR car.model LIKE :like ESCAPE '\\'
      OR (c.first_name || coalesce(' ' || c.last_name, '')) LIKE :like ESCAPE '\\' OR t.notes LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params }
}

/**
 * One page of the ledger plus totals. Totals follow the period, car and search
 * filters but not category / method, so the tiles always show the full picture.
 */
export async function listTransactions(search: z.output<typeof transactionListSearchSchema>, today: string) {
  const { page, size } = search
  const { where, params } = filters(search, today)
  const { total } = (await db.get<{ total: number }>(`SELECT COUNT(*) AS total ${from} ${where}`, params))!
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(page, pageCount)
  const items = await db.all<Transaction>(
    `SELECT ${columns} ${from} ${where} ORDER BY t.occurred_on DESC, t.id DESC LIMIT :limit OFFSET :offset`,
    { ...params, limit: size, offset: (current - 1) * size },
  )
  const totals = await ledgerTotals({ q: search.q, period: search.period, car: search.car }, today)
  return { items, total, page: current, pageCount, totals }
}

/** Every entry matching the filters (no paging), oldest first, for CSV export. */
export function exportTransactions(search: z.output<typeof transactionListSearchSchema>, today: string) {
  const { where, params } = filters(search, today)
  return db.all<Transaction>(`SELECT ${columns} ${from} ${where} ORDER BY t.occurred_on ASC, t.id ASC`, params)
}

export async function ledgerTotals(search: { q?: string; period?: Period; car?: number }, today: string) {
  const { where, params } = filters(search, today)
  return withPnl((await db.get<RawTotals>(`SELECT ${totalsColumns} ${from} ${where}`, params))!)
}

export function transactionsForCar(carId: number) {
  return db.all<Transaction>(`SELECT ${columns} ${from} WHERE t.car_id = ? ORDER BY t.occurred_on DESC, t.id DESC`, [carId])
}

const toParams = (v: TransactionValues) => ({ ...v, amount: toCents(v.amount) })

export async function insertTransaction(v: TransactionValues) {
  const { lastInsertRowid } = await db.run(
    `INSERT INTO transactions (car_id, customer_id, occurred_on, category, amount_cents, method, notes)
     VALUES (:carId, :customerId, :occurredOn, :category, :amount, :method, :notes)`,
    toParams(v),
  )
  return lastInsertRowid
}

export async function updateTransaction(id: number, v: TransactionValues) {
  const { changes } = await db.run(
    `UPDATE transactions SET car_id = :carId, customer_id = :customerId, occurred_on = :occurredOn,
       category = :category, amount_cents = :amount, method = :method, notes = :notes, updated_at = ${sqlNow}
     WHERE id = :id`,
    { ...toParams(v), id },
  )
  return changes > 0
}

export async function deleteTransaction(id: number) {
  return (await db.run('DELETE FROM transactions WHERE id = ?', [id])).changes > 0
}
