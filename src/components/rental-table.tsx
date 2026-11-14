import { Cell, Column, Row, Table, TableBody, TableHeader } from 'react-aria-components/Table'
import { Link } from '~/components/ui/link'
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
      <Table className="data-table" aria-label="Rentals">
        <TableHeader>
            {hide !== 'customer' && <Column>Customer</Column>}
            {hide !== 'car' && <Column>Car</Column>}
            <Column>Started</Column>
            <Column className="num">Weekly rent</Column>
            <Column className="num">Owed</Column>
            <Column className="hide-narrow">Next due</Column>
            <Column>Status</Column>
            <Column aria-label="Open" />
          </TableHeader>
        <TableBody>
          {rentals.map((r) => (
            <Row key={r.id} id={r.id}>
              {hide !== 'customer' && (
                <Cell>
                  <Link to="/customers/$customerId" params={{ customerId: String(r.customerId) }} search={{ tab: 'rentals' }}>
                    {r.customerName}
                  </Link>
                  <div className="muted small">{r.customerPhone}</div>
                </Cell>
              )}
              {hide !== 'car' && (
                <Cell>
                  <Link to="/cars/$carId" params={{ carId: String(r.carId) }} search={{ tab: 'rentals' }}>
                    {r.carName} <span className="plate">{r.carPlate}</span>
                  </Link>
                </Cell>
              )}
              <Cell>
                {formatDate(r.startDate)}
                {r.returnedOn && <div className="muted small">to {formatDate(r.returnedOn)}</div>}
              </Cell>
              <Cell className="num">{formatMoney(r.weeklyCents)}</Cell>
              <Cell className="num"><OwedCell rental={r} /></Cell>
              <Cell className="hide-narrow">{r.nextDueOn ? formatDate(r.nextDueOn) : '—'}</Cell>
              <Cell><RentalStatusBadge status={r.status} /></Cell>
              <Cell><Link to="/rentals/$rentalId" params={{ rentalId: String(r.id) }} className="small">Open →</Link></Cell>
            </Row>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
