import { describe, expect, it } from 'vitest'
import { attentionLabel, carAttention } from './attention'

const today = '2026-11-13'
const flags = (regoExpiry: string | null, insuranceExpiry: string | null, status = 'ready' as const) =>
  carAttention({ status, regoExpiry, insuranceExpiry }, today).map(attentionLabel)

describe('carAttention', () => {
  it('flags expired, missing and expiring dates, most urgent first', () => {
    expect(flags('2026-12-01', '2026-11-08')).toEqual(['Insurance expired 5d ago', 'Rego 18d'])
    expect(flags('2026-11-13', null)).toEqual(['No insurance date', 'Rego due today'])
  })

  it('ignores dates more than 30 days away', () => {
    expect(flags('2026-12-13', '2026-12-14')).toEqual(['Rego 30d'])
  })

  it('never flags a sold car', () => {
    expect(carAttention({ status: 'sold', regoExpiry: null, insuranceExpiry: '2020-01-01' }, today)).toEqual([])
  })
})
