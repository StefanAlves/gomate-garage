import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import { db, likePattern, sqlNow, toCents } from './db.server'
import type { ChargeKind, ChargeStatus, ChargeValues, chargeListInputSchema } from '~/lib/schemas'

// Fines and tolls recorded against a car (and, when known, the customer who
// had it). Both kinds share one table; tolls never have an offence type.

export interface Charge {
  id: number
  kind: ChargeKind
  carId: number | null
  carPlate: string | null
  customerId: number | null
  customerName: string | null
  incurredOn: string
  dueOn: string | null
  offenceType: string | null
  noticeNumber: string | null
  amountCents: number
  paymentReference: string | null
  status: ChargeStatus
  note: string | null
  createdAt: string
  updatedAt: string
}

const columns = `ch.id, ch.kind, ch.car_id AS carId, car.plate AS carPlate, ch.customer_id AS customerId,
  (c.first_name || coalesce(' ' || c.last_name, '')) AS customerName, ch.incurred_on AS incurredOn,
  ch.due_on AS dueOn, ch.offence_type AS offenceType, ch.notice_number AS noticeNumber,
  ch.amount_cents AS amountCents, ch.payment_reference AS paymentReference, ch.status, ch.note,
  ch.created_at AS createdAt, ch.updated_at AS updatedAt`
const from = `FROM charges ch LEFT JOIN cars car ON car.id = ch.car_id LEFT JOIN customers c ON c.id = ch.customer_id`

export async function listCharges({ kind, q, page, size, status, customer }: z.output<typeof chargeListInputSchema>) {
  const conditions = ['ch.kind = :kind']
  const params: Record<string, string | number> = { kind }
  if (status) {
    conditions.push('ch.status = :status')
    params.status = status
  }
  if (customer !== undefined) {
    conditions.push('ch.customer_id = :customer')
    params.customer = customer
  }
  const like = likePattern(q)
  if (like) {
    conditions.push(`(car.plate LIKE :like ESCAPE '\\' OR ch.notice_number LIKE :like ESCAPE '\\'
      OR ch.offence_type LIKE :like ESCAPE '\\' OR (c.first_name || coalesce(' ' || c.last_name, '')) LIKE :like ESCAPE '\\')`)
    params.like = like
  }
  const where = `WHERE ${conditions.join(' AND ')}`
  const { total, amountCents } = (await db.get<{ total: number; amountCents: number }>(
    `SELECT COUNT(*) AS total, coalesce(SUM(ch.amount_cents), 0) AS amountCents ${from} ${where}`, params,
  ))!
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(page, pageCount)
  const items = await db.all<Charge>(
    `SELECT ${columns} ${from} ${where} ORDER BY ch.incurred_on DESC, ch.id DESC LIMIT :limit OFFSET :offset`,
    { ...params, limit: size, offset: (current - 1) * size },
  )
  return { items, total, amountCents, page: current, pageCount }
}

export function chargesForCar(carId: number, kind: ChargeKind) {
  return db.all<Charge>(
    `SELECT ${columns} ${from} WHERE ch.car_id = ? AND ch.kind = ? ORDER BY ch.incurred_on DESC, ch.id DESC`, [carId, kind],
  )
}

/** Count and total of fines + tolls nobody has paid yet. */
export function unpaidCharges() {
  return db.all<{ kind: ChargeKind; count: number; amountCents: number }>(
    `SELECT ch.kind, COUNT(*) AS count, coalesce(SUM(ch.amount_cents), 0) AS amountCents
     FROM charges ch WHERE ch.status = 'not_paid' GROUP BY ch.kind`,
  )
}

// Tolls have no offence type; drop it so a stray value can't be stored.
const toParams = (v: ChargeValues) => ({
  ...v,
  offenceType: v.kind === 'fine' ? v.offenceType : null,
  amount: toCents(v.amount),
})

export async function insertCharge(v: ChargeValues) {
  const { lastInsertRowid } = await db.run(
    `INSERT INTO charges (kind, car_id, customer_id, incurred_on, due_on, offence_type, notice_number,
       amount_cents, payment_reference, status, note)
     VALUES (:kind, :carId, :customerId, :incurredOn, :dueOn, :offenceType, :noticeNumber,
       :amount, :paymentReference, :status, :note)`,
    toParams(v),
  )
  return lastInsertRowid
}

export async function updateCharge(id: number, v: ChargeValues) {
  const { changes } = await db.run(
    `UPDATE charges SET car_id = :carId, customer_id = :customerId, incurred_on = :incurredOn, due_on = :dueOn,
       offence_type = :offenceType, notice_number = :noticeNumber, amount_cents = :amount,
       payment_reference = :paymentReference, status = :status, note = :note, updated_at = ${sqlNow}
     WHERE id = :id AND kind = :kind`,
    { ...toParams(v), id },
  )
  return changes > 0
}

export async function deleteCharge(id: number) {
  return (await db.run('DELETE FROM charges WHERE id = ?', [id])).changes > 0
}
