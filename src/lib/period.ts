import type { Period } from './schemas'

/** The garage's local calendar day (YYYY-MM-DD). Pass `now` in tests. */
export function garageToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(now)
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Inclusive date range (YYYY-MM-DD) for a period filter, or null for "all".
 * Weeks start on Monday.
 */
export function periodRange(period: Period, today: string): { from: string; to: string } | null {
  switch (period) {
    case 'all':
      return null
    case 'today':
      return { from: today, to: today }
    case 'week': {
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7 // Mon = 0
      return { from: shift(today, -weekday), to: today }
    }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case '30d':
      return { from: shift(today, -29), to: today }
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
  }
}

export const periodLabel: Record<Period, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  '30d': 'Last 30 days',
  year: 'This year',
  all: 'All time',
}

export { shift as addDays }
