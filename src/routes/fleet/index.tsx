import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { CAR_STATUSES, PERIODS, overviewSearchSchema } from '~/lib/schemas'
import { carStatusLabel, formatDate, formatMoneyShort, formatPercent, formatSigned } from '~/lib/format'
import { periodLabel } from '~/lib/period'
import { getFleetOverview } from '~/server/fleet.functions'
import { ParamSelect } from '~/components/list-toolbar'

export const Route = createFileRoute('/fleet/')({
  validateSearch: overviewSearchSchema,
  search: { middlewares: [stripSearchParams({ period: 'all' })] },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getFleetOverview({ data: deps }),
  head: () => ({ meta: [{ title: 'Fleet overview · Garage' }] }),
  component: Overview,
})

function Overview() {
  const { period } = Route.useSearch()
  const { today, totals, statusCounts, unpaid, expiring, overdueFinance, rentalsBehind } = Route.useLoaderData()
  const fines = unpaid.find((u) => u.kind === 'fine')
  const tolls = unpaid.find((u) => u.kind === 'toll')

  const tiles = [
    ['Rental income', formatMoneyShort(totals.rentalIncomeCents)],
    ['Sale income', formatMoneyShort(totals.saleIncomeCents)],
    ['Investment + expenses', formatMoneyShort(totals.investedCents + totals.expensesCents)],
    ['Profit / loss', formatSigned(totals.pnlCents)],
    ['ROI', formatPercent(totals.roi)],
  ] as const

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Fleet overview</h1>
        <ParamSelect from="/fleet/" param="period" label="Period" value={period}
          options={PERIODS.map((p) => [p, periodLabel[p]] as const)} />
      </div>

      <section className="tiles compact" aria-label="Money">
        {tiles.map(([label, value]) => (
          <Link key={label} to="/fleet/transactions" search={{ period }} className="panel tile plain-link">
            <span className="muted small">{label}</span>
            <span className="tile-value">{value}</span>
          </Link>
        ))}
      </section>

      <section className="panel stack">
        <div className="row between wrap">
          <h2>Where every car is</h2>
          <Link to="/fleet/stock" className="small">Open stock board →</Link>
        </div>
        <div className="row wrap">
          {CAR_STATUSES.map((s) => (
            <span key={s} className={`badge status-${s}`}>
              {carStatusLabel[s]} · {statusCounts[s] ?? 0}
            </span>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>Customers behind on payments</h2>
        <dl className="dl">
          <dt><Link to="/fleet/rentals" search={{ show: 'behind' }}>Rentals</Link></dt>
          <dd className={rentalsBehind.count ? 'urgent' : undefined}>
            {rentalsBehind.count ? `${rentalsBehind.count} · ${formatMoneyShort(rentalsBehind.owedCents)} in arrears` : 'None'}
          </dd>
          <dt><Link to="/fleet/sales" search={{ show: 'overdue' }}>Finance sales</Link></dt>
          <dd className={overdueFinance.count ? 'urgent' : undefined}>
            {overdueFinance.count ? `${overdueFinance.count} overdue · ${formatMoneyShort(overdueFinance.arrearsCents)} in arrears` : 'None'}
          </dd>
        </dl>
      </section>

      <div className="two-col">
        <section className="panel stack">
          <h2>Unpaid fines & tolls</h2>
          <dl className="dl">
            <dt><Link to="/fleet/fines" search={{ status: 'not_paid' }}>Fines</Link></dt>
            <dd>{fines ? `${fines.count} · ${formatMoneyShort(fines.amountCents)}` : 'None'}</dd>
            <dt><Link to="/fleet/tolls" search={{ status: 'not_paid' }}>Tolls</Link></dt>
            <dd>{tolls ? `${tolls.count} · ${formatMoneyShort(tolls.amountCents)}` : 'None'}</dd>
          </dl>
        </section>

        <section className="panel stack">
          <h2>Rego & insurance due</h2>
          {expiring.length === 0 ? (
            <p className="muted">Nothing expires in the next 30 days.</p>
          ) : (
            <ul className="plain-list">
              {expiring.map((e) => (
                <li key={`${e.id}-${e.what}`} className="row between">
                  <Link to="/cars/$carId" params={{ carId: String(e.id) }}>
                    <span className="plate">{e.plate}</span> {e.name}
                  </Link>
                  <span className={e.expiresOn < today ? 'urgent small' : 'muted small'}>
                    {e.what === 'rego' ? 'Rego' : 'Insurance'} {e.expiresOn < today ? 'expired' : 'due'} {formatDate(e.expiresOn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="muted small">"Owed to you" and "Overdue" tiles arrive with Rentals and fleet invoices.</p>
    </div>
  )
}
