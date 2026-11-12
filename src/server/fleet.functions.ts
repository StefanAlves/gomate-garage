import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import {
  chargeInputSchema,
  chargeListInputSchema,
  idSchema,
  overviewSearchSchema,
  stockSearchSchema,
  transactionInputSchema,
  transactionListSearchSchema,
  updateCarStockSchema,
  updateChargeSchema,
  updateTransactionSchema,
} from '~/lib/schemas'
import { addDays, garageToday } from '~/lib/period'
import { isForeignKeyViolation } from './db.server'
import * as cars from './cars.server'
import * as charges from './charges.server'
import * as ledger from './transactions.server'
import * as customers from './customers.server'
import * as finance from './finance.server'
import * as rentals from './rentals.server'
import * as maintenance from './maintenance.server'

// Fleet section RPCs: stock, fines & tolls, the money ledger and the overview.
// Same conventions as garage.functions.ts.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

function referenceError(err: unknown): Result<never> {
  if (isForeignKeyViolation(err)) return { ok: false, errors: { form: 'That vehicle or customer no longer exists' } }
  throw err
}

/** Vehicle + customer choices for the fine, toll and transaction forms. */
export const listPickerOptions = createServerFn({ method: 'GET' }).handler(() => ({
  cars: cars.carOptions(),
  customers: customers.customerOptions(),
}))

// ---- Overview ----------------------------------------------------------------

export const getFleetOverview = createServerFn({ method: 'GET' })
  .validator(overviewSearchSchema)
  .handler(({ data }) => {
    const today = garageToday()
    return {
      today,
      totals: ledger.ledgerTotals({ period: data.period }, today),
      statusCounts: cars.stockStatusCounts(),
      unpaid: charges.unpaidCharges(),
      expiring: cars.expiringCompliance(addDays(today, 30)),
      overdueFinance: finance.overdueFinanceSales(today),
      maintenance: maintenance.maintenanceCounts(today),
      rentalsBehind: (() => {
        const behind = rentals.listRentals({ status: 'active', show: 'behind', sort: 'arrears' }, today)
        return { count: behind.length, owedCents: behind.reduce((s, r) => s + r.owedCents, 0) }
      })(),
    }
  })

// ---- Stock ---------------------------------------------------------------------

export const listStock = createServerFn({ method: 'GET' })
  .validator(stockSearchSchema)
  .handler(({ data }) => cars.listStock(data))

export const updateCarStock = createServerFn({ method: 'POST' })
  .validator(updateCarStockSchema)
  .handler(({ data }): Result<{ id: number }> => {
    const outcome = cars.updateCarStock(data.id, data.values)
    if (outcome === 'not_found') throw notFound()
    if (outcome === 'status_locked')
      return { ok: false, errors: { status: 'This car is out with a customer. Its status changes when the rental or sale ends.' } }
    return { ok: true, value: { id: data.id } }
  })

/** Everything the car page's Stock, Fines, Tolls and Money tabs show. */
export const getCarFleetRecords = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => ({
    fines: charges.chargesForCar(data.id, 'fine'),
    tolls: charges.chargesForCar(data.id, 'toll'),
    transactions: ledger.transactionsForCar(data.id),
    totals: ledger.ledgerTotals({ car: data.id }, garageToday()),
  }))

// ---- Fines & tolls ----------------------------------------------------------------

export const listCharges = createServerFn({ method: 'GET' })
  .validator(chargeListInputSchema)
  .handler(({ data }) => charges.listCharges(data))

export const createCharge = createServerFn({ method: 'POST' })
  .validator(chargeInputSchema)
  .handler(({ data }): Result<{ id: number }> => {
    try {
      return { ok: true, value: { id: charges.insertCharge(data) } }
    } catch (err) {
      return referenceError(err)
    }
  })

export const updateCharge = createServerFn({ method: 'POST' })
  .validator(updateChargeSchema)
  .handler(({ data }): Result<{ id: number }> => {
    try {
      if (!charges.updateCharge(data.id, data.values)) throw notFound()
      return { ok: true, value: { id: data.id } }
    } catch (err) {
      return referenceError(err)
    }
  })

export const deleteCharge = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(({ data }): Result<null> => {
    charges.deleteCharge(data.id)
    return { ok: true, value: null }
  })

// ---- Transactions ------------------------------------------------------------------

export const listTransactions = createServerFn({ method: 'GET' })
  .validator(transactionListSearchSchema)
  .handler(({ data }) => ledger.listTransactions(data, garageToday()))

export const exportTransactions = createServerFn({ method: 'GET' })
  .validator(transactionListSearchSchema)
  .handler(({ data }) => ledger.exportTransactions(data, garageToday()))

export const createTransaction = createServerFn({ method: 'POST' })
  .validator(transactionInputSchema)
  .handler(({ data }): Result<{ id: number }> => {
    try {
      return { ok: true, value: { id: ledger.insertTransaction(data) } }
    } catch (err) {
      return referenceError(err)
    }
  })

export const updateTransaction = createServerFn({ method: 'POST' })
  .validator(updateTransactionSchema)
  .handler(({ data }): Result<{ id: number }> => {
    try {
      if (!ledger.updateTransaction(data.id, data.values)) throw notFound()
      return { ok: true, value: { id: data.id } }
    } catch (err) {
      return referenceError(err)
    }
  })

export const deleteTransaction = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(({ data }): Result<null> => {
    ledger.deleteTransaction(data.id)
    return { ok: true, value: null }
  })
