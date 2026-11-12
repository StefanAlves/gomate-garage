import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import {
  idSchema, maintenanceListSearchSchema, recordReadingSchema, recordServiceSchema, setServiceIntervalSchema,
} from '~/lib/schemas'
import { garageToday } from '~/lib/period'
import * as maintenance from './maintenance.server'

// Maintenance RPCs. Same conventions as garage.functions.ts: expected failures
// come back as { ok: false, errors } keyed by form field.

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

/** Field errors for a refused reading or service; `dateField` names the form's date input. */
function readingError(reason: Exclude<ReturnType<typeof maintenance.recordReading>, { ok: true }>['reason'], dateField: string): Result<never> {
  switch (reason) {
    case 'not_found':
      throw notFound()
    case 'not_rental':
      return { ok: false, errors: { form: 'Maintenance is tracked for Rental cars only.' } }
    case 'future':
      return { ok: false, errors: { [dateField]: "Can't be in the future" } }
    case 'lower_than_earlier':
      return { ok: false, errors: { km: 'Lower than an earlier reading. Tick "This is a correction" if it\'s right.' } }
    case 'higher_than_later':
      return { ok: false, errors: { km: 'Higher than a later reading. Tick "This is a correction" if it\'s right.' } }
  }
}

export const getMaintenance = createServerFn({ method: 'GET' })
  .validator(idSchema)
  .handler(({ data }) => {
    const today = garageToday()
    const found = maintenance.getMaintenance(data.id, today)
    if (!found) throw notFound()
    return { ...found, today }
  })

export const listMaintenance = createServerFn({ method: 'GET' })
  .validator(maintenanceListSearchSchema)
  .handler(({ data }) => {
    const today = garageToday()
    return { today, items: maintenance.dueSoonList(today, data.show), counts: maintenance.maintenanceCounts(today) }
  })

export const setServiceInterval = createServerFn({ method: 'POST' })
  .validator(setServiceIntervalSchema)
  .handler(({ data }): Result<null> => {
    switch (maintenance.setServiceInterval(data.id, data.values)) {
      case 'not_found':
        throw notFound()
      case 'not_rental':
        return { ok: false, errors: { form: 'Maintenance is tracked for Rental cars only.' } }
      case 'ok':
        return { ok: true, value: null }
    }
  })

export const recordReading = createServerFn({ method: 'POST' })
  .validator(recordReadingSchema)
  .handler(({ data }): Result<null> => {
    const out = maintenance.recordReading(data.id, data.values, garageToday())
    return out.ok ? { ok: true, value: null } : readingError(out.reason, 'readOn')
  })

export const deleteReading = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(({ data }): Result<null> => {
    if (maintenance.deleteReading(data.id) === 'from_service')
      return { ok: false, errors: { form: 'This reading came from a service. Delete the service instead.' } }
    return { ok: true, value: null }
  })

export const recordService = createServerFn({ method: 'POST' })
  .validator(recordServiceSchema)
  .handler(({ data }): Result<null> => {
    const out = maintenance.recordService(data.id, data.values, garageToday())
    return out.ok ? { ok: true, value: null } : readingError(out.reason, 'servicedOn')
  })

export const deleteService = createServerFn({ method: 'POST' })
  .validator(idSchema)
  .handler(({ data }): Result<null> => {
    maintenance.deleteService(data.id)
    return { ok: true, value: null }
  })
