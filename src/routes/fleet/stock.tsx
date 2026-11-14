import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { CAR_STATUSES, STATUSES_BY_PURPOSE, stockSearchDefaults, stockSearchSchema } from '~/lib/schemas'
import {
  carStatusLabel, formatDate, formatKm, formatMoneyShort, formatPercent, formatSigned, fuelLabel,
} from '~/lib/format'
import { listStock } from '~/server/fleet.functions'
import type { StockItem } from '~/server/cars.server'
import { ParamSelect, SearchBox } from '~/components/list-toolbar'

export const Route = createFileRoute('/fleet/stock')({
  validateSearch: stockSearchSchema,
  search: { middlewares: [stripSearchParams(stockSearchDefaults)] },
  pendingMs: Infinity, // keep the current results on screen while a filter change loads
  loaderDeps: ({ search: { purpose, sort, q } }) => ({ purpose, sort, q }),
  loader: ({ deps }) => listStock({ data: { ...stockSearchDefaults, ...deps } }),
  head: () => ({ meta: [{ title: 'Stock · Garage' }] }),
  component: StockPage,
})

const sortOptions = [
  ['longest', 'Longest in stock'],
  ['value', 'Highest value'],
  ['rego', 'Rego A–Z'],
] as const

function StockPage() {
  const search = Route.useSearch()
  const items = Route.useLoaderData()

  return (
    <div className="stack">
      <div className="row between wrap">
        <div className="row wrap">
          <h1>Stock</h1>
          <span className="segmented" role="group" aria-label="View">
            {(['board', 'table'] as const).map((v) => (
              <Link key={v} from={Route.fullPath} search={(p) => ({ ...p, view: v })} replace activeProps={{}}
                className={search.view === v ? 'active' : undefined}>
                {v === 'board' ? 'Board' : 'Table'}
              </Link>
            ))}
          </span>
        </div>
        <Link to="/cars/new" className="button">Add vehicle</Link>
      </div>

      <div className="row wrap">
        <span className="segmented" role="group" aria-label="Purpose">
          {(['all', 'rental', 'sale'] as const).map((p) => (
            <Link key={p} from={Route.fullPath} search={(s) => ({ ...s, purpose: p })} replace activeProps={{}}
              className={search.purpose === p ? 'active' : undefined}>
              {p === 'all' ? 'All' : p === 'rental' ? 'Rental cars' : 'Sale cars'}
            </Link>
          ))}
        </span>
        <SearchBox from="/fleet/stock" q={search.q} placeholder="Search vehicle or rego…" />
        <ParamSelect from="/fleet/stock" param="sort" label="Sort" value={search.sort} options={sortOptions} />
      </div>

      {search.view === 'board' ? (
        <Board items={items} statuses={search.purpose === 'all' ? CAR_STATUSES : STATUSES_BY_PURPOSE[search.purpose]} />
      ) : (
        <StockTable items={items} />
      )}
    </div>
  )
}

function Purpose({ car }: { car: StockItem }) {
  return <span className={`badge purpose-${car.purpose}`}>{car.purpose === 'rental' ? 'Rent' : 'Sale'}</span>
}

function Price({ car }: { car: StockItem }) {
  if (car.purpose === 'sale' && car.askingPriceCents != null) return <>{formatMoneyShort(car.askingPriceCents)}</>
  if (car.purpose === 'rental' && car.weeklyRateCents != null) return <>{formatMoneyShort(car.weeklyRateCents)}/wk</>
  return null
}

function Board({ items, statuses }: { items: StockItem[]; statuses: readonly (typeof CAR_STATUSES)[number][] }) {
  return (
    <div className="board">
      {statuses.map((status) => {
        const cars = items.filter((c) => c.status === status)
        return (
          <section key={status} className="board-col" aria-label={carStatusLabel[status]}>
            <h2 className="board-title">
              <span className={`dot status-${status}`} /> {carStatusLabel[status]} <span className="muted">{cars.length}</span>
            </h2>
            {cars.length === 0 && <p className="muted small">Nothing here</p>}
            {cars.map((car) => (
              <Link key={car.id} to="/cars/$carId" params={{ carId: String(car.id) }} search={{ tab: 'stock' }} className="board-card">
                <strong>{car.year ? `${car.year} ` : ''}{car.make} {car.model}</strong>
                <span className="row tight">
                  <span className="plate">{car.plate}</span>
                  {car.color && <span className="muted small">{car.color}</span>}
                </span>
                <span className="row between">
                  <Purpose car={car} />
                  <span className="small strong"><Price car={car} /></span>
                </span>
              </Link>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function StockTable({ items }: { items: StockItem[] }) {
  if (items.length === 0) return <div className="panel muted">No stock matches these filters.</div>
  return (
    <div className="table-wrap panel flush">
      <table className="data-table nowrap">
        <thead>
          <tr>
            <th>Status</th><th>Purpose</th><th>Vehicle</th><th>Rego</th><th>Colour</th><th>Body</th><th>Trans.</th>
            <th>Fuel</th><th className="num">Odometer</th><th className="num">Rent/wk</th><th className="num">Asking</th>
            <th className="num">Min</th><th className="num">Invested</th><th className="num">Expenses</th>
            <th className="num">Rental income</th><th className="num">Sale income</th><th className="num">P&L</th>
            <th className="num">ROI</th><th>Rego expiry</th><th>Insurance</th><th>Checks</th>
          </tr>
        </thead>
        <tbody>
          {items.map((car) => (
            <tr key={car.id}>
              <td><span className={`badge status-${car.status}`}>{carStatusLabel[car.status]}</span></td>
              <td><Purpose car={car} /></td>
              <td>
                <Link to="/cars/$carId" params={{ carId: String(car.id) }} search={{ tab: 'stock' }}>
                  {car.year ? `${car.year} ` : ''}{car.make} {car.model}
                </Link>
              </td>
              <td><span className="plate">{car.plate}</span></td>
              <td>{car.color ?? '—'}</td>
              <td>{car.bodyStyle ?? '—'}</td>
              <td>{car.transmission ?? '—'}</td>
              <td>{car.fuelType ? fuelLabel[car.fuelType] : '—'}</td>
              <td className="num">{formatKm(car.mileageKm)}</td>
              <td className="num">{car.purpose === 'rental' ? formatMoneyShort(car.weeklyRateCents) : '—'}</td>
              <td className="num">{car.purpose === 'sale' ? formatMoneyShort(car.askingPriceCents) : '—'}</td>
              <td className="num">{car.purpose === 'sale' ? formatMoneyShort(car.minPriceCents) : '—'}</td>
              <td className="num">{formatMoneyShort(car.investedCents)}</td>
              <td className="num">{formatMoneyShort(car.expensesCents)}</td>
              <td className="num">{formatMoneyShort(car.rentalIncomeCents)}</td>
              <td className="num">{formatMoneyShort(car.saleIncomeCents)}</td>
              <td className={`num ${car.pnlCents < 0 ? 'urgent' : 'positive'}`}>{formatSigned(car.pnlCents)}</td>
              <td className="num">{formatPercent(car.roi)}</td>
              <td>{formatDate(car.regoExpiry)}</td>
              <td>{formatDate(car.insuranceExpiry)}</td>
              <td className="row tight">
                {car.ppsrChecked && <span className="badge status-ready">PPSR</span>}
                {car.writtenOff && <span className="badge urgent">Written off</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small table-foot">{items.length} vehicles</p>
    </div>
  )
}
