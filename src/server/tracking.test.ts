import { beforeEach, describe, expect, it } from 'vitest'
import { customerInputSchema, newCarInputSchema, startRentalInputSchema } from '~/lib/schemas'
import { db } from './db.server'
import { insertCar } from './cars.server'
import { insertCustomer } from './customers.server'
import { startRental } from './rentals.server'
import { fleetLocations, traccarConfig } from './tracking.server'

const env = { TRACCAR_URL: 'https://traccar.test/', TRACCAR_TOKEN: 'secret' }
const now = new Date('2026-11-16T10:00:00Z')

const devices = [
  { id: 1, name: 'abc 123', uniqueId: '111', status: 'online', lastUpdate: '2026-11-16T09:59:00Z', positionId: 10, extra: 'dropped' },
  { id: 2, name: 'Phone test', uniqueId: '222', status: 'offline', lastUpdate: null, positionId: null },
]
const positions = [
  { id: 10, deviceId: 1, latitude: -33.86, longitude: 151.2, speed: 0, course: 90, fixTime: '2026-11-16T09:58:00Z',
    address: null, attributes: { ignition: false, totalDistance: 1500, sat: 9 } },
]

/** A Traccar server that answers like the real API, recording what it was asked. */
function fakeTraccar(status = 200) {
  const calls: { url: string; auth: string | null }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
    const body = url.endsWith('/api/devices') ? devices : positions
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { calls, fetchImpl }
}

beforeEach(async () => {
  await db.exec(`DELETE FROM rental_deductions; DELETE FROM rental_rent_rates; DELETE FROM transactions; DELETE FROM rentals;
           DELETE FROM charges; DELETE FROM customer_documents; DELETE FROM cars; DELETE FROM customers`)
})

describe('Traccar settings', () => {
  it('is off without a URL and a login', () => {
    expect(traccarConfig({})).toBeNull()
    expect(traccarConfig({ TRACCAR_URL: 'https://t.test' })).toBeNull()
  })

  it('takes an API token, or an email and password', () => {
    expect(traccarConfig(env)).toEqual({ url: 'https://traccar.test', authorization: 'Bearer secret' })
    expect(traccarConfig({ TRACCAR_URL: 'https://t.test', TRACCAR_EMAIL: 'a@b.c', TRACCAR_PASSWORD: 'pw' })?.authorization)
      .toBe(`Basic ${btoa('a@b.c:pw')}`)
  })
})

describe('fleet locations', () => {
  it('says tracking is not set up when there are no settings', async () => {
    expect(await fleetLocations({ env: {} })).toEqual({ status: 'not_configured' })
  })

  it('puts each tracker on its car and names the customer the car is out with', async () => {
    const carId = await insertCar(newCarInputSchema.parse({ purpose: 'rental', status: 'ready', plate: 'ABC123', make: 'Toyota', model: 'Corolla' }))
    await insertCar(newCarInputSchema.parse({ purpose: 'sale', status: 'ready', plate: 'XYZ999', make: 'Mazda', model: '3' }))
    const customerId = await insertCustomer(customerInputSchema.parse({ firstName: 'Ana', lastName: 'Lee', phone: '0400 000 000' }))
    await startRental(startRentalInputSchema.parse({ carId, customerId, startDate: '2026-11-01', weeklyRent: '200', bond: '0', bondMethod: 'cash' }))

    const { calls, fetchImpl } = fakeTraccar()
    const result = await fleetLocations({ env, now, fetchImpl })

    expect(calls.map((c) => c.url).sort()).toEqual(['https://traccar.test/api/devices', 'https://traccar.test/api/positions'])
    expect(calls.every((c) => c.auth === 'Bearer secret')).toBe(true)
    if (result.status !== 'ok') throw new Error(result.status)
    const [abc, xyz] = result.cars
    expect(abc).toMatchObject({ plate: 'ABC123', customerName: 'Ana Lee', tracker: { device: { id: 1 }, position: { latitude: -33.86 } } })
    expect(abc!.tracker!.device).not.toHaveProperty('extra')
    expect(abc!.tracker!.position!.attributes).toEqual({ ignition: false, totalDistance: 1500 })
    expect(xyz).toMatchObject({ plate: 'XYZ999', customerName: null, tracker: null })
    expect(result.unmatched.map((d) => d.name)).toEqual(['Phone test'])
    expect(result.checkedAt).toBe(now.toISOString())
  })

  it('narrows to one car', async () => {
    const carId = await insertCar(newCarInputSchema.parse({ purpose: 'rental', status: 'ready', plate: 'ABC123', make: 'Toyota', model: 'Corolla' }))
    await insertCar(newCarInputSchema.parse({ purpose: 'sale', status: 'ready', plate: 'XYZ999', make: 'Mazda', model: '3' }))
    const result = await fleetLocations({ carId, env, now, fetchImpl: fakeTraccar().fetchImpl })
    expect(result.status === 'ok' && result.cars.map((c) => c.plate)).toEqual(['ABC123'])
  })

  it('explains a refused login or an unreachable server instead of failing the page', async () => {
    expect(await fleetLocations({ env, fetchImpl: fakeTraccar(401).fetchImpl })).toMatchObject({
      status: 'error', message: expect.stringMatching(/refused the login/),
    })
    const offline = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
    expect(await fleetLocations({ env, fetchImpl: offline })).toMatchObject({
      status: 'error', message: expect.stringMatching(/Couldn't reach/),
    })
  })
})
