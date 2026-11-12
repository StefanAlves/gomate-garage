import { createClient, type Client, type InValue } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { migrate, splitStatements } from './migrations.server'

const fresh = () => createClient({ url: ':memory:' })
const rows = async (db: Client, sql: string, args: InValue[] = []) => {
  const rs = await db.execute({ sql, args })
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])))
}
const run = (db: Client, sql: string, args: InValue[] = []) => db.execute({ sql, args })

/** A database at schema version 4 (before car purpose). */
async function v4() {
  const db = fresh()
  await migrate(db, 4)
  await db.execute(`INSERT INTO customers (id, first_name, phone) VALUES (1, 'Ana', '0400000000')`)
  return db
}

function addCar(db: Client, id: number, status: string, forRent: 0 | 1, forSale: 0 | 1, customerId: number | null = null) {
  return run(db,
    `INSERT INTO cars (id, plate, make, model, status, for_rent, for_sale, customer_id, weekly_rate_cents, asking_price_cents)
     VALUES (?, ?, 'Toyota', 'Corolla', ?, ?, ?, ?, 19000, 1500000)`,
    [id, `CAR${id}`, status, forRent, forSale, customerId],
  )
}

const carRow = async (db: Client, id: number) => (await rows(db, 'SELECT * FROM cars WHERE id = ?', [id]))[0]!

describe('statement splitter', async () => {
  it('splits at top-level semicolons only', async () => {
    expect(splitStatements(`CREATE TABLE a (x TEXT DEFAULT 'a;b'); -- note; here
      INSERT INTO a VALUES ('c;d') ;
      /* block; comment */ SELECT 1;`)).toEqual([
      `CREATE TABLE a (x TEXT DEFAULT 'a;b')`,
      `-- note; here\n      INSERT INTO a VALUES ('c;d')`,
      `/* block; comment */ SELECT 1`,
    ])
  })
})

describe('foreign key check', async () => {
  it('rolls a migration back when it leaves a broken foreign key', async () => {
    const db = fresh()
    await migrate(db, 7)
    await db.execute('PRAGMA foreign_keys = OFF')
    await db.execute(`INSERT INTO rentals (customer_id, car_id, start_date) VALUES (98, 99, '2026-01-01')`)
    await expect(migrate(db, 8)).rejects.toThrow('Migration 8 left broken foreign keys')
    expect(await rows(db, 'PRAGMA user_version')).toEqual([{ user_version: 7 }])
    expect(await rows(db, `SELECT name FROM sqlite_schema WHERE name = 'services'`)).toEqual([])
  })
})

describe('migration 5: car purpose', async () => {
  it('maps the listing flags to a purpose', async () => {
    const db = await v4()
    await addCar(db, 1, 'ready', 1, 0)
    await addCar(db, 2, 'ready', 0, 1)
    await addCar(db, 3, 'ready', 1, 1)
    await addCar(db, 4, 'preparation', 0, 0)
    await addCar(db, 5, 'sold', 1, 0)
    await migrate(db)
    expect((await Promise.all([1, 2, 3, 4, 5].map((id) => carRow(db, id)))).map((r) => r.purpose)).toEqual(['rental', 'sale', 'sale', 'sale', 'sale'])
  })

  it('maps the old statuses to the new lifecycle', async () => {
    const db = await v4()
    await addCar(db, 1, 'out', 1, 0)
    await addCar(db, 2, 'out', 0, 1)
    await addCar(db, 3, 'returned', 1, 0)
    await addCar(db, 4, 'sold', 0, 1)
    await addCar(db, 5, 'preparation', 1, 0)
    await addCar(db, 6, 'ready', 0, 1)
    await migrate(db)
    expect((await Promise.all([1, 2, 3, 4, 5, 6].map((id) => carRow(db, id)))).map((r) => r.status)).toEqual([
      'rented', 'under_finance', 'preparation', 'sold', 'preparation', 'ready',
    ])
  })

  it('drops ownership and the listing flags but keeps prices and the ledger', async () => {
    const db = await v4()
    await addCar(db, 1, 'ready', 0, 1, 1)
    await db.execute(`INSERT INTO transactions (car_id, customer_id, occurred_on, category, amount_cents) VALUES (1, 1, '2026-01-01', 'expense', 500)`)
    await migrate(db)
    const row = await carRow(db, 1)
    expect(row).not.toHaveProperty('customer_id')
    expect(row).not.toHaveProperty('for_rent')
    expect(row).not.toHaveProperty('for_sale')
    expect(row).toMatchObject({ plate: 'CAR1', weekly_rate_cents: 19000, asking_price_cents: 1500000 })
    expect(await rows(db, 'SELECT COUNT(*) AS n FROM transactions WHERE car_id = 1')).toEqual([{ n: 1 }])
  })

  it('rejects a status that does not match the purpose', async () => {
    const db = await v4()
    await migrate(db)
    const insert = (purpose: string, status: string) =>
      run(db, `INSERT INTO cars (plate, make, model, purpose, status) VALUES (?, 'Mazda', '3', ?, ?)`, [`${purpose}-${status}`, purpose, status])
    await expect(insert('rental', 'under_finance')).rejects.toThrow(/CHECK/)
    await expect(insert('rental', 'sold')).rejects.toThrow(/CHECK/)
    await expect(insert('sale', 'rented')).rejects.toThrow(/CHECK/)
    await expect(insert('lease', 'ready')).rejects.toThrow(/CHECK/)
    await expect(insert('rental', 'rented')).resolves.toBeDefined()
    await expect(insert('sale', 'under_finance')).resolves.toBeDefined()
  })
})

describe('migration 6: rentals', async () => {
  it('renames paid_by_renter to paid_by_customer and leaves other statuses alone', async () => {
    const db = fresh()
    await migrate(db, 5)
    await db.executeMultiple(`INSERT INTO charges (id, kind, incurred_on, status) VALUES
      (1, 'fine', '2026-01-01', 'paid_by_renter'), (2, 'toll', '2026-01-01', 'not_paid')`)
    await migrate(db, 6)
    expect(await rows(db, 'SELECT id, status FROM charges ORDER BY id'))
      .toEqual([{ id: 1, status: 'paid_by_customer' }, { id: 2, status: 'not_paid' }])
    expect(await rows(db, 'SELECT rental_id FROM transactions')).toEqual([])
  })
})

describe('migration 7: finance sales', async () => {
  it('only accepts deals whose parts add up', async () => {
    const db = fresh()
    await migrate(db, 7)
    await db.executeMultiple(`INSERT INTO customers (id, first_name, phone) VALUES (1, 'Ana', '0400000000');
             INSERT INTO cars (id, purpose, plate, make, model) VALUES (1, 'sale', 'S1', 'Toyota', 'Corolla')`)
    const insert = (deposit: number, n: number, each: number) =>
      run(db, `INSERT INTO finance_sales (customer_id, car_id, agreed_on, price_cents, deposit_cents, instalment_count, instalment_cents)
               VALUES (1, 1, '2026-01-01', 10000, ?, ?, ?)`, [deposit, n, each])
    await expect(insert(5000, 0, 0)).rejects.toThrow(/CHECK/)    // cash sale must be paid in full
    await expect(insert(1000, 3, 4500)).rejects.toThrow(/CHECK/) // instalments overshoot the price
    await expect(insert(1000, 3, 3000)).resolves.toBeDefined()   // last instalment is 3000
  })
})

describe('migration 8: maintenance', async () => {
  it("turns rental cars' odometer into their first reading", async () => {
    const db = fresh()
    await migrate(db, 7)
    await db.executeMultiple(`INSERT INTO cars (id, purpose, plate, make, model, mileage_km, updated_at) VALUES
      (1, 'rental', 'R1', 'Toyota', 'Corolla', 120000, '2026-11-08T07:45:42.340Z'),
      (2, 'rental', 'R2', 'Toyota', 'Corolla', NULL, '2026-11-08T07:45:42.340Z'),
      (3, 'sale', 'S1', 'Toyota', 'Corolla', 90000, '2026-11-08T07:45:42.340Z')`)
    await migrate(db, 8)
    expect(await rows(db, 'SELECT car_id AS carId, read_on AS readOn, km FROM odometer_readings'))
      .toEqual([{ carId: 1, readOn: '2026-11-08', km: 120000 }])
    expect(await rows(db, 'SELECT service_interval_km AS km, service_interval_months AS months FROM cars WHERE id = 1'))
      .toEqual([{ km: null, months: null }])
  })
})
