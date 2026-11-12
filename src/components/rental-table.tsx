import { Link } from '@tanstack/react-router'
import { formatDate, formatMoney, rentalStatusLabel } from '~/lib/format'
import type { RentalWithSummary } from '~/server/rentals.server'

/** What a Rental's owed column says: Arrears while active, the unpaid shortfall after Return. */
export function OwedCell({ rental }: { rental: Pick<RentalWithSummary, 'owedCents' | 'status' | 'weeksBehind'> }) {
  if (rental.owedCents > 0)
    return (
      <span className="urgent">
        {formatMoney(rental.owedCents)}
        {rental.status === 'active' && <span className="small"> · {rental.weeksBehind} wk</span>}
      </span>
    )
  if (rental.owedCents < 0) return <span className="positive">{formatMoney(-rental.owedCents)} ahead</span>
  return <span className="muted">—</span>
}

export function RentalStatusBadge({ status }: { status: RentalWithSummary['status'] }) {
  return <span className={`badge rental-${status}`}>{rentalStatusLabel[status]}</span>
}

/** Rentals as a table; the customer or car column is dropped on that record's own page. */
export function RentalTable({ rentals, hide }: { rentals: RentalWithSummary[]; hide?: 'customer' | 'car' }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {hide !== 'customer' && <th>Customer</th>}
            {hide !== 'car' && <th>Car</th>}
            <th>Started</th>
            <th className="num">Weekly rent</th>
            <th className="num">Owed</th>
            <th className="hide-narrow">Next due</th>
            <th>Status</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id}>
              {hide !== 'customer' && (
                <td>
                  <Link to="/customers/$customerId" params={{ customerId: String(r.customerId) }} search={{ tab: 'rentals' }}>
                    {r.customerName}
                  </Link>
                  <div className="muted small">{r.customerPhone}</div>
                </td>
              )}
              {hide !== 'car' && (
                <td>
                  <Link to="/cars/$carId" params={{ carId: String(r.carId) }} search={{ tab: 'rentals' }}>
                    {r.carName} <span className="plate">{r.carPlate}</span>
                  </Link>
                </td>
              )}
              <td>
                {formatDate(r.startDate)}
                {r.returnedOn && <div className="muted small">to {formatDate(r.returnedOn)}</div>}
              </td>
              <td className="num">{formatMoney(r.weeklyCents)}</td>
              <td className="num"><OwedCell rental={r} /></td>
              <td className="hide-narrow">{r.nextDueOn ? formatDate(r.nextDueOn) : '—'}</td>
              <td><RentalStatusBadge status={r.status} /></td>
              <td><Link to="/rentals/$rentalId" params={{ rentalId: String(r.id) }} className="small">Open →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
