import { Link } from '@tanstack/react-router'
import { financeStatusLabel, formatDate, formatMoney } from '~/lib/format'
import type { FinanceSaleWithSummary } from '~/server/finance.server'

export function FinanceStatusBadge({ status }: { status: FinanceSaleWithSummary['status'] }) {
  return <span className={`badge finance-${status}`}>{financeStatusLabel[status]}</span>
}

/** Arrears with an Overdue badge, or "ahead" when paid early. */
export function ArrearsCell({ sale }: { sale: Pick<FinanceSaleWithSummary, 'arrearsCents' | 'weeksBehind' | 'overdue' | 'status'> }) {
  if (sale.overdue)
    return (
      <span className="urgent">
        {formatMoney(sale.arrearsCents)} <span className="small">· {sale.weeksBehind} wk</span>{' '}
        <span className="badge urgent">Overdue</span>
      </span>
    )
  if (sale.status === 'active' && sale.arrearsCents < 0) return <span className="positive">{formatMoney(-sale.arrearsCents)} ahead</span>
  return <span className="muted">—</span>
}

/** Finance Sales as a table; the customer or car column is dropped on that record's own page. */
export function FinanceTable({ sales, hide }: { sales: FinanceSaleWithSummary[]; hide?: 'customer' | 'car' }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {hide !== 'customer' && <th>Customer</th>}
            {hide !== 'car' && <th>Car</th>}
            <th>Agreed</th>
            <th className="num hide-narrow">Price</th>
            <th className="num">Balance</th>
            <th className="num">Arrears</th>
            <th className="hide-narrow">Next due</th>
            <th>Status</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {sales.map((f) => (
            <tr key={f.id}>
              {hide !== 'customer' && (
                <td>
                  <Link to="/customers/$customerId" params={{ customerId: String(f.customerId) }} search={{ tab: 'finance' }}>
                    {f.customerName}
                  </Link>
                  <div className="muted small">{f.customerPhone}</div>
                </td>
              )}
              {hide !== 'car' && (
                <td>
                  <Link to="/cars/$carId" params={{ carId: String(f.carId) }} search={{ tab: 'finance' }}>
                    {f.carName} <span className="plate">{f.carPlate}</span>
                  </Link>
                </td>
              )}
              <td>
                {formatDate(f.agreedOn)}
                {f.closedOn && <div className="muted small">closed {formatDate(f.closedOn)}</div>}
              </td>
              <td className="num hide-narrow">{formatMoney(f.priceCents)}</td>
              <td className="num">{formatMoney(f.balanceCents)}</td>
              <td className="num"><ArrearsCell sale={f} /></td>
              <td className="hide-narrow">{f.nextDueOn ? formatDate(f.nextDueOn) : '—'}</td>
              <td><FinanceStatusBadge status={f.status} /></td>
              <td><Link to="/finance-sales/$saleId" params={{ saleId: String(f.id) }} className="small">Open →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
