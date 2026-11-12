import '@tanstack/react-start/server-only'
import { db, likePattern } from './db.server'
import { customerInputSchema } from '~/lib/schemas'
import type { AuState, ContactMethod, CustomerValues, InlineCustomer, customerListSearchSchema } from '~/lib/schemas'
import type { z } from 'zod'

export interface Customer {
  id: number
  firstName: string
  lastName: string | null
  company: string | null
  taxId: string | null
  email: string | null
  phone: string
  landline: string | null
  street: string | null
  suburb: string | null
  state: AuState | null
  postcode: string | null
  newsletterOptIn: boolean
  marketingOptIn: boolean
  preferredContact: ContactMethod[]
  tags: string[]
  licenceNumber: string | null
  licenceExpiry: string | null
  passportNumber: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}
export interface CustomerListItem
  extends Pick<Customer, 'id' | 'firstName' | 'lastName' | 'company' | 'email' | 'phone' | 'suburb' | 'state' | 'createdAt'> {
}

type Row = Omit<Customer, 'newsletterOptIn' | 'marketingOptIn' | 'preferredContact' | 'tags'> & {
  newsletterOptIn: number
  marketingOptIn: number
  preferredContact: string
  tags: string
}

const columns = `id, first_name AS firstName, last_name AS lastName, company, tax_id AS taxId, email, phone, landline,
  street, suburb, state, postcode, newsletter_opt_in AS newsletterOptIn, marketing_opt_in AS marketingOptIn,
  preferred_contact AS preferredContact, tags, licence_number AS licenceNumber, licence_expiry AS licenceExpiry,
  passport_number AS passportNumber, notes, created_at AS createdAt, updated_at AS updatedAt`

const splitList = (s: string) => (s ? s.split(',') : [])

function fromRow(r: Row): Customer {
  return {
    ...r,
    newsletterOptIn: !!r.newsletterOptIn,
    marketingOptIn: !!r.marketingOptIn,
    preferredContact: splitList(r.preferredContact) as ContactMethod[],
    tags: splitList(r.tags),
  }
}

function toParams(v: CustomerValues) {
  return {
    ...v,
    newsletterOptIn: v.newsletterOptIn ? 1 : 0,
    marketingOptIn: v.marketingOptIn ? 1 : 0,
    preferredContact: v.preferredContact.join(','),
    tags: v.tags.join(','),
  }
}

const fullName = `(c.first_name || coalesce(' ' || c.last_name, ''))`
const orderBy = {
  recent: 'c.created_at DESC, c.id DESC',
  oldest: 'c.created_at ASC, c.id ASC',
  name_asc: 'c.first_name COLLATE NOCASE ASC, c.last_name COLLATE NOCASE ASC',
  name_desc: 'c.first_name COLLATE NOCASE DESC, c.last_name COLLATE NOCASE DESC',
} as const

export function listCustomers({ q, page, size, sort }: z.output<typeof customerListSearchSchema>) {
  const like = likePattern(q)
  const where = like
    ? `WHERE ${fullName} LIKE :like ESCAPE '\\' OR c.company LIKE :like ESCAPE '\\' OR c.phone LIKE :like ESCAPE '\\'
         OR c.email LIKE :like ESCAPE '\\' OR c.tax_id LIKE :like ESCAPE '\\' OR c.suburb LIKE :like ESCAPE '\\'`
    : ''
  const params: Record<string, string> = like ? { like } : {}
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM customers c ${where}`).get(params) as { total: number }
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(page, pageCount)
  const items = db
    .prepare(
      `SELECT c.id, c.first_name AS firstName, c.last_name AS lastName, c.company, c.email, c.phone, c.suburb, c.state,
              c.created_at AS createdAt
       FROM customers c
       ${where}
       ORDER BY ${orderBy[sort]}
       LIMIT :limit OFFSET :offset`,
    )
    .all({ ...params, limit: size, offset: (current - 1) * size }) as unknown as CustomerListItem[]
  return { items, total, page: current, pageCount }
}

/** Compact list for customer pickers and filters. */
export function customerOptions() {
  return db
    .prepare(`SELECT c.id, ${fullName} AS name, c.phone FROM customers c ORDER BY c.first_name COLLATE NOCASE, c.last_name COLLATE NOCASE`)
    .all() as unknown as { id: number; name: string; phone: string }[]
}

export function getCustomer(id: number) {
  const row = db.prepare(`SELECT ${columns} FROM customers WHERE id = ?`).get(id) as Row | undefined
  return row ? fromRow(row) : null
}

export function insertCustomer(v: CustomerValues) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO customers (first_name, last_name, company, tax_id, email, phone, landline, street, suburb, state, postcode,
         newsletter_opt_in, marketing_opt_in, preferred_contact, tags, licence_number, licence_expiry, passport_number, notes)
       VALUES (:firstName, :lastName, :company, :taxId, :email, :phone, :landline, :street, :suburb, :state, :postcode,
         :newsletterOptIn, :marketingOptIn, :preferredContact, :tags, :licenceNumber, :licenceExpiry, :passportNumber, :notes)`,
    )
    .run(toParams(v))
  return Number(lastInsertRowid)
}

export function updateCustomer(id: number, v: CustomerValues) {
  const { changes } = db
    .prepare(
      `UPDATE customers SET first_name = :firstName, last_name = :lastName, company = :company, tax_id = :taxId,
         email = :email, phone = :phone, landline = :landline, street = :street, suburb = :suburb, state = :state,
         postcode = :postcode, newsletter_opt_in = :newsletterOptIn, marketing_opt_in = :marketingOptIn,
         preferred_contact = :preferredContact, tags = :tags, licence_number = :licenceNumber,
         licence_expiry = :licenceExpiry, passport_number = :passportNumber, notes = :notes,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = :id`,
    )
    .run({ ...toParams(v), id })
  return changes > 0
}

export function deleteCustomer(id: number) {
  return db.prepare(`DELETE FROM customers WHERE id = ?`).run(id).changes > 0
}

/**
 * The Customer picked on a Rental or Finance Sale form: the existing one, or a
 * walk-in created from name and mobile. Null when the picked one is gone.
 * Call inside the caller's transaction.
 */
export function resolveInlineCustomer(v: InlineCustomer): number | null {
  if (v.customerMode === 'new')
    return insertCustomer(customerInputSchema.parse({ firstName: v.firstName, lastName: v.lastName ?? '', phone: v.phone }))
  return v.customerId != null && db.prepare('SELECT 1 FROM customers WHERE id = ?').get(v.customerId) ? v.customerId : null
}
