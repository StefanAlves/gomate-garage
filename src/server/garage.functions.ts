import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import {
  customerInputSchema,
  carListSearchSchema,
  customerListSearchSchema,
  documentUploadSchema,
  fieldErrors,
  idSchema,
  newCarInputSchema,
  updateCarSchema,
  updateCustomerSchema,
} from '~/lib/schemas'
import { isForeignKeyViolation, isUniqueViolation } from './db.server'
import * as customers from './customers.server'
import * as cars from './cars.server'
import * as documents from './documents.server'

// Typed RPC boundary. Safe to import anywhere: on the client each export is a
// fetch stub; handlers and the *.server imports they use stay on the server.
// Expected failures (duplicate plate, records still linked) come back as
// `{ ok: false, errors }` so forms can show them next to the right field.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

// ---- Customers -------------------------------------------------------------

export const listCustomers = createServerFn({ method: 'GET' })
  .validator(customerListSearchSchema)
  .handler(({ data }) => customers.listCustomers(data))

export const listCustomerOptions = createServerFn({ method: 'GET' }).handler(() => customers.customerOptions())

export const getCustomer = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => {
    const customer = customers.getCustomer(data.id)
    if (!customer) throw notFound()
    return { customer, documents: documents.documentsForCustomer(data.id) }
  })

export const createCustomer = createServerFn({ method: 'POST' })
  .validator(customerInputSchema)
  .handler(({ data }): Result<{ id: number }> => ({ ok: true, value: { id: customers.insertCustomer(data) } }))

export const updateCustomer = createServerFn({ method: 'POST' })
  .validator(updateCustomerSchema)
  .handler(({ data }): Result<{ id: number }> => {
    if (!customers.updateCustomer(data.id, data.values)) throw notFound()
    return { ok: true, value: { id: data.id } }
  })

export const deleteCustomer = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const files = documents.documentFilesForCustomer(data.id)
      customers.deleteCustomer(data.id) // document rows cascade; their files are removed below
      await Promise.all(files.map(documents.removeFile))
      return { ok: true, value: null }
    } catch (err) {
      if (isForeignKeyViolation(err))
        return {
          ok: false,
          errors: { form: 'This customer still has fines, tolls or transactions. Reassign or delete those first.' },
        }
      throw err
    }
  })

// ---- Customer documents ----------------------------------------------------

/** Multipart upload: the browser sends FormData { customerId, kind, file }. */
export const uploadCustomerDocument = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error('Expected form data')
    return Object.fromEntries(input) as Record<string, unknown>
  })
  .handler(async ({ data }): Promise<Result<{ id: number }>> => {
    const parsed = documentUploadSchema.safeParse(data)
    if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) }
    const { customerId, kind, file } = parsed.data
    if (!customers.getCustomer(customerId)) throw notFound()
    const id = await documents.saveDocument(customerId, kind, file)
    if (id == null) return { ok: false, errors: { file: 'That file is not a JPEG, PNG or WebP image' } }
    return { ok: true, value: { id } }
  })

export const deleteCustomerDocument = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(async ({ data }) => {
    if (!(await documents.deleteDocument(data.id))) throw notFound()
    return null
  })

// ---- Cars ------------------------------------------------------------------

function carWriteError(err: unknown): Result<never> {
  if (isUniqueViolation(err, 'cars.plate')) return { ok: false, errors: { plate: 'A car with this plate is already registered' } }
  if (isUniqueViolation(err, 'cars.vin')) return { ok: false, errors: { vin: 'A car with this VIN is already registered' } }
  throw err
}

export const listCars = createServerFn({ method: 'GET' })
  .validator(carListSearchSchema)
  .handler(({ data }) => cars.listCars(data))

export const getCar = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => {
    const car = cars.getCar(data.id)
    if (!car) throw notFound()
    return car
  })

export const createCar = createServerFn({ method: 'POST' })
  .validator(newCarInputSchema)
  .handler(({ data }): Result<{ id: number }> => {
    try {
      return { ok: true, value: { id: cars.insertCar(data) } }
    } catch (err) {
      return carWriteError(err)
    }
  })

export const updateCar = createServerFn({ method: 'POST' })
  .validator(updateCarSchema)
  .handler(({ data }): Result<{ id: number }> => {
    try {
      if (!cars.updateCar(data.id, data.values)) throw notFound()
      return { ok: true, value: { id: data.id } }
    } catch (err) {
      return carWriteError(err)
    }
  })

export const deleteCar = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(({ data }): Result<null> => {
    try {
      cars.deleteCar(data.id)
      return { ok: true, value: null }
    } catch (err) {
      if (isForeignKeyViolation(err))
        return { ok: false, errors: { form: 'This car has fines, tolls or transactions recorded. Delete those first.' } }
      throw err
    }
  })
