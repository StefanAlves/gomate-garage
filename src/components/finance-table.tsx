import { Cell, Column, Row, Table, TableBody, TableHeader } from 'react-aria-components/Table'
import { Link } from '~/components/ui/link'
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
      <Table className="data-table" aria-label="Finance sales">
        <TableHeader>
            {hide !== 'customer' && <Column>Customer</Column>}
            {hide !== 'car' && <Column>Car</Column>}
            <Column>Agreed</Column>
            <Column className="num hide-narrow">Price</Column>
            <Column className="num">Balance</Column>
            <Column className="num">Arrears</Column>
            <Column className="hide-narrow">Next due</Column>
            <Column>Status</Column>
            <Column aria-label="Open" />
          </TableHeader>
        <TableBody>
          {sales.map((f) => (
            <Row key={f.id} id={f.id}>
              {hide !== 'customer' && (
                <Cell>
                  <Link to="/customers/$customerId" params={{ customerId: String(f.customerId) }} search={{ tab: 'finance' }}>
                    {f.customerName}
                  </Link>
                  <div className="muted small">{f.customerPhone}</div>
                </Cell>
              )}
              {hide !== 'car' && (
                <Cell>
                  <Link to="/cars/$carId" params={{ carId: String(f.carId) }} search={{ tab: 'finance' }}>
                    {f.carName} <span className="plate">{f.carPlate}</span>
                  </Link>
                </Cell>
              )}
              <Cell>
                {formatDate(f.agreedOn)}
                {f.closedOn && <div className="muted small">closed {formatDate(f.closedOn)}</div>}
              </Cell>
              <Cell className="num hide-narrow">{formatMoney(f.priceCents)}</Cell>
              <Cell className="num">{formatMoney(f.balanceCents)}</Cell>
              <Cell className="num"><ArrearsCell sale={f} /></Cell>
              <Cell className="hide-narrow">{f.nextDueOn ? formatDate(f.nextDueOn) : '—'}</Cell>
              <Cell><FinanceStatusBadge status={f.status} /></Cell>
              <Cell><Link to="/finance-sales/$saleId" params={{ saleId: String(f.id) }} className="small">Open →</Link></Cell>
            </Row>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
