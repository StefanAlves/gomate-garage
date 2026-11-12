import '@tanstack/react-start/server-only'
import type { DatabaseSync } from 'node:sqlite'

export const sqlNow = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const now = sqlNow

/*
 * Schema migrations, tracked with PRAGMA user_version. Each entry runs once,
 * in order, inside a transaction. Never edit a shipped migration; add a new one.
 */
export const migrations: string[] = [
  // 1: original customer + car registry.
  `
  CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    email      TEXT,
    tax_id     TEXT,
    address    TEXT,
    notes      TEXT,
    created_at TEXT NOT NULL DEFAULT (${now}),
    updated_at TEXT NOT NULL DEFAULT (${now})
  );
  CREATE TABLE IF NOT EXISTS cars (
    id          INTEGER PRIMARY KEY,
    plate       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    make        TEXT NOT NULL,
    model       TEXT NOT NULL,
    year        INTEGER,
    color       TEXT,
    vin         TEXT UNIQUE,
    mileage_km  INTEGER,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (${now}),
    updated_at  TEXT NOT NULL DEFAULT (${now})
  );
  `,

  // 2: full customer profile + vehicle specs; a car's owner becomes optional
  //    (NULL = owned by the business). SQLite can't change columns in place,
  //    so both tables are rebuilt and the existing rows copied across.
  `
  CREATE TABLE customers_v2 (
    id                INTEGER PRIMARY KEY,
    first_name        TEXT NOT NULL,
    last_name         TEXT,
    company           TEXT,
    tax_id            TEXT,
    email             TEXT,
    phone             TEXT NOT NULL,
    landline          TEXT,
    street            TEXT,
    suburb            TEXT,
    state             TEXT,
    postcode          TEXT,
    newsletter_opt_in INTEGER NOT NULL DEFAULT 0,
    marketing_opt_in  INTEGER NOT NULL DEFAULT 0,
    preferred_contact TEXT NOT NULL DEFAULT '',  -- comma-separated CONTACT_METHODS
    tags              TEXT NOT NULL DEFAULT '',  -- comma-separated, lowercase
    licence_number    TEXT,
    licence_expiry    TEXT,                      -- YYYY-MM-DD
    passport_number   TEXT,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (${now}),
    updated_at        TEXT NOT NULL DEFAULT (${now})
  );
  INSERT INTO customers_v2 (id, first_name, last_name, tax_id, email, phone, street, notes, created_at, updated_at)
  SELECT id,
         CASE WHEN instr(trim(name), ' ') > 0 THEN substr(trim(name), 1, instr(trim(name), ' ') - 1) ELSE trim(name) END,
         CASE WHEN instr(trim(name), ' ') > 0 THEN trim(substr(trim(name), instr(trim(name), ' ') + 1)) END,
         tax_id, email, phone, address, notes, created_at, updated_at
  FROM customers;

  CREATE TABLE cars_v2 (
    id                     INTEGER PRIMARY KEY,
    status                 TEXT NOT NULL DEFAULT 'ready',
    customer_id            INTEGER REFERENCES customers(id) ON DELETE RESTRICT,  -- NULL = business-owned
    plate                  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    make                   TEXT NOT NULL,
    model                  TEXT NOT NULL,
    variant                TEXT,
    year                   INTEGER,
    color                  TEXT,
    vin                    TEXT UNIQUE,
    engine_number          TEXT,
    build_date             TEXT,     -- YYYY-MM
    compliance_date        TEXT,     -- YYYY-MM
    engine_type            TEXT,
    cylinders              INTEGER,
    fuel_type              TEXT,
    transmission           TEXT,
    body_style             TEXT,
    radio_pin              TEXT,
    mileage_km             INTEGER,
    next_service_date      TEXT,
    next_service_km        INTEGER,
    next_transmission_date TEXT,
    next_transmission_km   INTEGER,
    rego_expiry            TEXT,
    insurance_provider     TEXT,
    insurance_policy       TEXT,
    insurance_expiry       TEXT,
    ppsr_checked           INTEGER NOT NULL DEFAULT 0,
    written_off            INTEGER NOT NULL DEFAULT 0,
    notes                  TEXT,
    created_at             TEXT NOT NULL DEFAULT (${now}),
    updated_at             TEXT NOT NULL DEFAULT (${now})
  );
  INSERT INTO cars_v2 (id, customer_id, plate, make, model, year, color, vin, mileage_km, notes, created_at, updated_at)
  SELECT id, customer_id, plate, make, model, year, color, vin, mileage_km, notes, created_at, updated_at FROM cars;

  DROP TABLE cars;
  DROP TABLE customers;
  ALTER TABLE customers_v2 RENAME TO customers;
  ALTER TABLE cars_v2 RENAME TO cars;

  CREATE INDEX cars_customer_idx ON cars(customer_id);
  CREATE INDEX cars_created_idx ON cars(created_at);
  CREATE INDEX customers_name_idx ON customers(first_name COLLATE NOCASE, last_name COLLATE NOCASE);
  CREATE INDEX customers_created_idx ON customers(created_at);
  `,

  // 3: fleet section. Car statuses become GoMate's stock lifecycle
  //    (preparation → ready → out → sold / returned) with sale / rent listing
  //    as separate flags; adds fines & tolls (charges) and a per-car money ledger.
  //    Money is stored as integer cents.
  `
  ALTER TABLE cars ADD COLUMN for_rent            INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE cars ADD COLUMN weekly_rate_cents   INTEGER;
  ALTER TABLE cars ADD COLUMN for_sale            INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE cars ADD COLUMN asking_price_cents  INTEGER;
  ALTER TABLE cars ADD COLUMN min_price_cents     INTEGER;
  ALTER TABLE cars ADD COLUMN listing_description TEXT;
  ALTER TABLE cars ADD COLUMN features            TEXT NOT NULL DEFAULT '';  -- comma-separated CAR_FEATURES

  UPDATE cars SET for_sale = 1 WHERE status = 'for_sale';
  UPDATE cars SET status = CASE status
    WHEN 'in_service' THEN 'preparation'
    WHEN 'off_road'   THEN 'preparation'
    WHEN 'rented'     THEN 'out'
    WHEN 'for_sale'   THEN 'ready'
    ELSE status END;

  CREATE TABLE charges (
    id                INTEGER PRIMARY KEY,
    kind              TEXT NOT NULL CHECK (kind IN ('fine', 'toll')),
    car_id            INTEGER REFERENCES cars(id) ON DELETE RESTRICT,       -- NULL = vehicle unknown
    customer_id       INTEGER REFERENCES customers(id) ON DELETE RESTRICT,  -- NULL = unknown / business
    incurred_on       TEXT NOT NULL,   -- offence or travel date, YYYY-MM-DD
    due_on            TEXT,
    offence_type      TEXT,            -- fines only
    notice_number     TEXT,
    amount_cents      INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
    payment_reference TEXT,
    status            TEXT NOT NULL DEFAULT 'not_paid',
    note              TEXT,
    created_at        TEXT NOT NULL DEFAULT (${now}),
    updated_at        TEXT NOT NULL DEFAULT (${now})
  );
  CREATE INDEX charges_kind_date_idx ON charges(kind, incurred_on);
  CREATE INDEX charges_car_idx ON charges(car_id);
  CREATE INDEX charges_customer_idx ON charges(customer_id);

  CREATE TABLE transactions (
    id           INTEGER PRIMARY KEY,
    car_id       INTEGER NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    customer_id  INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
    occurred_on  TEXT NOT NULL,        -- YYYY-MM-DD
    category     TEXT NOT NULL,        -- TRANSACTION_CATEGORIES
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),  -- direction comes from the category
    method       TEXT,                 -- PAYMENT_METHODS
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT (${now}),
    updated_at   TEXT NOT NULL DEFAULT (${now})
  );
  CREATE INDEX transactions_date_idx ON transactions(occurred_on);
  CREATE INDEX transactions_car_idx ON transactions(car_id);
  CREATE INDEX transactions_customer_idx ON transactions(customer_id);
  `,

  // 4: photos of a customer's ID documents. One image per slot; the file
  //    itself lives on disk (see documents.server.ts), not in the database.
  `
  CREATE TABLE customer_documents (
    id            INTEGER PRIMARY KEY,
    customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('licence_front', 'licence_back', 'passport')),
    file_name     TEXT NOT NULL UNIQUE,  -- random name under the uploads folder
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    original_name TEXT,
    created_at    TEXT NOT NULL DEFAULT (${now}),
    UNIQUE (customer_id, kind)
  );
  `,

  // 5: every car belongs to the garage and has a fixed purpose (see
  //    docs/adr/0001-garage-owns-every-car.md). Drops ownership and the
  //    for_rent / for_sale flags; statuses become the per-purpose lifecycle.
  //    Cars flagged both or neither, and sold cars, become sale cars.
  `
  CREATE TABLE cars_v5 (
    id                     INTEGER PRIMARY KEY,
    purpose                TEXT NOT NULL CHECK (purpose IN ('rental', 'sale')),
    status                 TEXT NOT NULL DEFAULT 'preparation',
    plate                  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    make                   TEXT NOT NULL,
    model                  TEXT NOT NULL,
    variant                TEXT,
    year                   INTEGER,
    color                  TEXT,
    vin                    TEXT UNIQUE,
    engine_number          TEXT,
    build_date             TEXT,     -- YYYY-MM
    compliance_date        TEXT,     -- YYYY-MM
    engine_type            TEXT,
    cylinders              INTEGER,
    fuel_type              TEXT,
    transmission           TEXT,
    body_style             TEXT,
    radio_pin              TEXT,
    mileage_km             INTEGER,
    next_service_date      TEXT,
    next_service_km        INTEGER,
    next_transmission_date TEXT,
    next_transmission_km   INTEGER,
    rego_expiry            TEXT,
    insurance_provider     TEXT,
    insurance_policy       TEXT,
    insurance_expiry       TEXT,
    ppsr_checked           INTEGER NOT NULL DEFAULT 0,
    written_off            INTEGER NOT NULL DEFAULT 0,
    notes                  TEXT,
    weekly_rate_cents      INTEGER,  -- rental cars
    asking_price_cents     INTEGER,  -- sale cars
    min_price_cents        INTEGER,  -- sale cars
    listing_description    TEXT,
    features               TEXT NOT NULL DEFAULT '',  -- comma-separated CAR_FEATURES
    created_at             TEXT NOT NULL DEFAULT (${now}),
    updated_at             TEXT NOT NULL DEFAULT (${now}),
    CHECK (
      (purpose = 'rental' AND status IN ('preparation', 'ready', 'rented')) OR
      (purpose = 'sale'   AND status IN ('preparation', 'ready', 'under_finance', 'sold'))
    )
  );
  WITH src AS (
    SELECT *, CASE WHEN for_rent = 1 AND for_sale = 0 AND status != 'sold' THEN 'rental' ELSE 'sale' END AS purpose
    FROM cars
  )
  INSERT INTO cars_v5 (id, purpose, status, plate, make, model, variant, year, color, vin, engine_number, build_date,
    compliance_date, engine_type, cylinders, fuel_type, transmission, body_style, radio_pin, mileage_km,
    next_service_date, next_service_km, next_transmission_date, next_transmission_km, rego_expiry,
    insurance_provider, insurance_policy, insurance_expiry, ppsr_checked, written_off, notes,
    weekly_rate_cents, asking_price_cents, min_price_cents, listing_description, features, created_at, updated_at)
  SELECT id, purpose,
    CASE status
      WHEN 'out' THEN CASE purpose WHEN 'rental' THEN 'rented' ELSE 'under_finance' END
      WHEN 'returned' THEN 'preparation'
      ELSE status END,
    plate, make, model, variant, year, color, vin, engine_number, build_date,
    compliance_date, engine_type, cylinders, fuel_type, transmission, body_style, radio_pin, mileage_km,
    next_service_date, next_service_km, next_transmission_date, next_transmission_km, rego_expiry,
    insurance_provider, insurance_policy, insurance_expiry, ppsr_checked, written_off, notes,
    weekly_rate_cents, asking_price_cents, min_price_cents, listing_description, features, created_at, updated_at
  FROM src;

  DROP TABLE cars;
  ALTER TABLE cars_v5 RENAME TO cars;
  CREATE INDEX cars_created_idx ON cars(created_at);
  CREATE INDEX cars_purpose_status_idx ON cars(purpose, status);
  `,

  // 6: Rentals (SPECs/rentals.md). A Rental ties a Customer to a Rental car
  //    with a Bond and a weekly Rent schedule; Rent and Bond money stays in the
  //    transactions ledger, linked by rental_id. `paid_by_renter` becomes
  //    `paid_by_customer` because Finance Sales use it too.
  `
  CREATE TABLE rentals (
    id            INTEGER PRIMARY KEY,
    customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    car_id        INTEGER NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    start_date    TEXT NOT NULL,     -- YYYY-MM-DD, the first week's due date
    bond_cents    INTEGER NOT NULL DEFAULT 0 CHECK (bond_cents >= 0),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
    returned_on   TEXT,
    return_reason TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (${now}),
    updated_at    TEXT NOT NULL DEFAULT (${now}),
    CHECK ((status = 'active') = (returned_on IS NULL))
  );
  CREATE UNIQUE INDEX rentals_active_car_idx ON rentals(car_id) WHERE status = 'active';
  CREATE INDEX rentals_customer_idx ON rentals(customer_id);

  CREATE TABLE rental_rent_rates (
    id             INTEGER PRIMARY KEY,
    rental_id      INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    effective_from TEXT NOT NULL,    -- YYYY-MM-DD
    weekly_cents   INTEGER NOT NULL CHECK (weekly_cents > 0),
    UNIQUE (rental_id, effective_from)
  );

  CREATE TABLE rental_deductions (
    id           INTEGER PRIMARY KEY,
    rental_id    INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('rent_arrears', 'fine', 'toll', 'damage', 'other')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    description  TEXT NOT NULL,
    charge_id    INTEGER REFERENCES charges(id) ON DELETE SET NULL
  );
  CREATE INDEX rental_deductions_rental_idx ON rental_deductions(rental_id);

  ALTER TABLE transactions ADD COLUMN rental_id INTEGER REFERENCES rentals(id) ON DELETE RESTRICT;
  CREATE INDEX transactions_rental_idx ON transactions(rental_id);

  UPDATE charges SET status = 'paid_by_customer' WHERE status = 'paid_by_renter';
  `,

  // 7: Finance Sales (SPECs/finance-sales.md). Deposit + n weekly Instalments
  //    for a Sale car; the last Instalment absorbs rounding, so only the
  //    regular amount is stored and the CHECK makes sure the parts add up.
  //    n = 0 is a cash sale (Deposit = price). Payments are sale_income rows
  //    carrying finance_sale_id.
  `
  CREATE TABLE finance_sales (
    id               INTEGER PRIMARY KEY,
    customer_id      INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    car_id           INTEGER NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    agreed_on        TEXT NOT NULL,      -- YYYY-MM-DD, Deposit due; Instalment k due 7k days later
    price_cents      INTEGER NOT NULL CHECK (price_cents > 0),
    deposit_cents    INTEGER NOT NULL CHECK (deposit_cents >= 0),
    instalment_count INTEGER NOT NULL CHECK (instalment_count >= 0),
    instalment_cents INTEGER NOT NULL CHECK (instalment_cents >= 0),
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted')),
    closed_on        TEXT,
    default_reason   TEXT,
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT (${now}),
    updated_at       TEXT NOT NULL DEFAULT (${now}),
    CHECK ((status = 'active') = (closed_on IS NULL)),
    CHECK (
      (instalment_count = 0 AND instalment_cents = 0 AND deposit_cents = price_cents) OR
      (instalment_count > 0 AND instalment_cents > 0 AND deposit_cents < price_cents
        AND price_cents - deposit_cents - (instalment_count - 1) * instalment_cents > 0)
    )
  );
  CREATE UNIQUE INDEX finance_sales_active_car_idx ON finance_sales(car_id) WHERE status = 'active';
  CREATE INDEX finance_sales_customer_idx ON finance_sales(customer_id);

  ALTER TABLE transactions ADD COLUMN finance_sale_id INTEGER REFERENCES finance_sales(id) ON DELETE RESTRICT;
  CREATE INDEX transactions_finance_sale_idx ON transactions(finance_sale_id);
  `,

  // 8: Rental Car maintenance (SPECs/maintenance.md). A service interval per
  //    car, an odometer history (the latest reading is cached in mileage_km)
  //    and services, whose cost is an `expense` row in the ledger. Rental cars'
  //    existing odometer values become their first reading.
  `
  ALTER TABLE cars ADD COLUMN service_interval_km INTEGER CHECK (service_interval_km > 0);
  ALTER TABLE cars ADD COLUMN service_interval_months INTEGER CHECK (service_interval_months > 0);

  CREATE TABLE services (
    id             INTEGER PRIMARY KEY,
    car_id         INTEGER NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    serviced_on    TEXT NOT NULL,      -- YYYY-MM-DD
    km             INTEGER NOT NULL CHECK (km >= 0),
    description    TEXT NOT NULL,
    cost_cents     INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (${now}),
    updated_at     TEXT NOT NULL DEFAULT (${now})
  );
  CREATE INDEX services_car_idx ON services(car_id, serviced_on);

  CREATE TABLE odometer_readings (
    id         INTEGER PRIMARY KEY,
    car_id     INTEGER NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    read_on    TEXT NOT NULL,          -- YYYY-MM-DD
    km         INTEGER NOT NULL CHECK (km >= 0),
    rental_id  INTEGER REFERENCES rentals(id) ON DELETE SET NULL,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,  -- the reading a service wrote
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (${now}),
    updated_at TEXT NOT NULL DEFAULT (${now})
  );
  CREATE INDEX odometer_readings_car_idx ON odometer_readings(car_id, read_on);

  INSERT INTO odometer_readings (car_id, read_on, km, note)
  SELECT id, substr(updated_at, 1, 10), mileage_km, 'From the car record'
  FROM cars WHERE purpose = 'rental' AND mileage_km IS NOT NULL;
  `,
]

/** Runs every migration after the database's user_version, up to `target` (default: all). */
export function migrate(db: DatabaseSync, target = migrations.length) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (current >= target) return
  // Table rebuilds drop tables that others reference, so FK checks are
  // switched off for the duration and verified before committing.
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    for (let v = current; v < target; v++) {
      db.exec('BEGIN')
      try {
        db.exec(migrations[v]!)
        const broken = db.prepare('PRAGMA foreign_key_check').all()
        if (broken.length) throw new Error(`Migration ${v + 1} left ${broken.length} broken foreign keys`)
        db.exec(`PRAGMA user_version = ${v + 1}`)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}
