import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrate } from './migrations.server'

/** A database at schema version 4 (before car purpose). */
function v4() {
  const db = new DatabaseSync(':memory:')
  migrate(db, 4)
  db.exec(`INSERT INTO customers (id, first_name, phone) VALUES (1, 'Ana', '0400000000')`)
  return db
}

function addCar(db: DatabaseSync, id: number, status: string, forRent: 0 | 1, forSale: 0 | 1, customerId: number | null = null) {
  db.prepare(
    `INSERT INTO cars (id, plate, make, model, status, for_rent, for_sale, customer_id, weekly_rate_cents, asking_price_cents)
     VALUES (?, ?, 'Toyota', 'Corolla', ?, ?, ?, ?, 19000, 1500000)`,
  ).run(id, `CAR${id}`, status, forRent, forSale, customerId)
}

const carRow = (db: DatabaseSync, id: number) =>
  db.prepare('SELECT * FROM cars WHERE id = ?').get(id) as Record<string, unknown>

describe('migration 5: car purpose', () => {
  it('maps the listing flags to a purpose', () => {
    const db = v4()
    addCar(db, 1, 'ready', 1, 0)
    addCar(db, 2, 'ready', 0, 1)
    addCar(db, 3, 'ready', 1, 1)
    addCar(db, 4, 'preparation', 0, 0)
    addCar(db, 5, 'sold', 1, 0)
    migrate(db)
    expect([1, 2, 3, 4, 5].map((id) => carRow(db, id).purpose)).toEqual(['rental', 'sale', 'sale', 'sale', 'sale'])
  })

  it('maps the old statuses to the new lifecycle', () => {
    const db = v4()
    addCar(db, 1, 'out', 1, 0)
    addCar(db, 2, 'out', 0, 1)
    addCar(db, 3, 'returned', 1, 0)
    addCar(db, 4, 'sold', 0, 1)
    addCar(db, 5, 'preparation', 1, 0)
    addCar(db, 6, 'ready', 0, 1)
    migrate(db)
    expect([1, 2, 3, 4, 5, 6].map((id) => carRow(db, id).status)).toEqual([
      'rented', 'under_finance', 'preparation', 'sold', 'preparation', 'ready',
    ])
  })

  it('drops ownership and the listing flags but keeps prices and the ledger', () => {
    const db = v4()
    addCar(db, 1, 'ready', 0, 1, 1)
    db.exec(`INSERT INTO transactions (car_id, customer_id, occurred_on, category, amount_cents) VALUES (1, 1, '2026-01-01', 'expense', 500)`)
    migrate(db)
    const row = carRow(db, 1)
    expect(row).not.toHaveProperty('customer_id')
    expect(row).not.toHaveProperty('for_rent')
    expect(row).not.toHaveProperty('for_sale')
    expect(row).toMatchObject({ plate: 'CAR1', weekly_rate_cents: 19000, asking_price_cents: 1500000 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE car_id = 1').get()).toEqual({ n: 1 })
  })

  it('rejects a status that does not match the purpose', () => {
    const db = v4()
    migrate(db)
    const insert = (purpose: string, status: string) =>
      db.prepare(`INSERT INTO cars (plate, make, model, purpose, status) VALUES (?, 'Mazda', '3', ?, ?)`)
        .run(`${purpose}-${status}`, purpose, status)
    expect(() => insert('rental', 'under_finance')).toThrow(/CHECK/)
    expect(() => insert('rental', 'sold')).toThrow(/CHECK/)
    expect(() => insert('sale', 'rented')).toThrow(/CHECK/)
    expect(() => insert('lease', 'ready')).toThrow(/CHECK/)
    expect(() => insert('rental', 'rented')).not.toThrow()
    expect(() => insert('sale', 'under_finance')).not.toThrow()
  })
})
