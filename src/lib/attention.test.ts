import { describe, expect, it } from 'vitest'
import { attentionLabel, carAttention } from './attention'

const today = '2026-11-13'
const label = (regoExpiry: string | null) => {
  const flag = carAttention({ status: 'ready', regoExpiry }, today)
  return flag && attentionLabel(flag)
}

describe('carAttention', () => {
  it('flags an expired, missing or expiring rego', () => {
    expect(label('2026-11-08')).toBe('Rego expired 5d ago')
    expect(label(null)).toBe('No rego date')
    expect(label('2026-11-13')).toBe('Rego due today')
    expect(label('2026-12-01')).toBe('Rego 18d')
  })

  it('ignores a rego more than 30 days away', () => {
    expect(label('2026-12-13')).toBe('Rego 30d')
    expect(label('2026-12-14')).toBeNull()
  })

  it('never flags a sold car', () => {
    expect(carAttention({ status: 'sold', regoExpiry: null }, today)).toBeNull()
  })
})
