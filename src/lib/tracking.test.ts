import { describe, expect, it } from 'vitest'
import { formatAgo, locationState, matchTrackers, normalizePlate, type TrackerDevice, type TrackerPosition } from './tracking'

const now = new Date('2026-11-16T10:00:00Z')

const device = (over: Partial<TrackerDevice> = {}): TrackerDevice => ({
  id: 1, name: 'ABC123', uniqueId: '867530900000001', status: 'online', lastUpdate: '2026-11-16T09:59:00Z', positionId: 10, ...over,
})

const position = (over: Partial<TrackerPosition> = {}): TrackerPosition => ({
  id: 10, deviceId: 1, latitude: -33.86, longitude: 151.2, speed: 0, course: 0,
  fixTime: '2026-11-16T09:58:00Z', address: null, attributes: {}, ...over,
})

describe('plate matching', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normalizePlate(' abc-123 ')).toBe('ABC123')
    expect(normalizePlate('AB C 12 3')).toBe('ABC123')
  })

  it('links a tracker to the car whose plate is its name', () => {
    const cars = [{ id: 7, plate: 'abc 123' }, { id: 8, plate: 'XYZ999' }]
    const { byCar, unmatched } = matchTrackers(cars, [device()], [position()])
    expect(byCar.get(7)).toEqual({ device: device(), position: position() })
    expect(byCar.has(8)).toBe(false)
    expect(unmatched).toEqual([])
  })

  it('falls back to the tracker identifier when the name is not a plate', () => {
    const { byCar } = matchTrackers([{ id: 7, plate: 'ABC123' }], [device({ name: 'Ute tracker', uniqueId: 'abc-123' })], [])
    expect(byCar.get(7)?.position).toBeNull()
  })

  it('lists trackers that match no car, so staff can rename them', () => {
    const stray = device({ id: 2, name: 'Phone test', uniqueId: '42' })
    const { unmatched } = matchTrackers([{ id: 7, plate: 'ABC123' }], [stray], [])
    expect(unmatched).toEqual([stray])
  })
})

describe('location state', () => {
  it('has no location before the first fix', () => {
    expect(locationState(null, now)).toBe('no_fix')
  })

  it('is moving above walking speed (Traccar reports knots)', () => {
    expect(locationState(position({ speed: 10 }), now)).toBe('moving')
    expect(locationState(position({ speed: 1 }), now)).toBe('parked')
  })

  it('goes stale when the last fix is over an hour old', () => {
    expect(locationState(position({ fixTime: '2026-11-16T08:59:00Z', speed: 30 }), now)).toBe('stale')
    expect(locationState(position({ fixTime: '2026-11-16T09:01:00Z' }), now)).toBe('parked')
  })
})

describe('time since the last fix', () => {
  it('reads like a person would say it', () => {
    expect(formatAgo('2026-11-16T09:59:40Z', now)).toBe('just now')
    expect(formatAgo('2026-11-16T09:55:00Z', now)).toBe('5 min ago')
    expect(formatAgo('2026-11-16T07:00:00Z', now)).toBe('3 h ago')
    expect(formatAgo('2026-11-13T10:00:00Z', now)).toBe('3 days ago')
  })
})
