import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { financeListSearchDefaults, financeListSearchSchema } from '~/lib/schemas'
import { formatMoneyShort } from '~/lib/format'
import { listFinanceSales } from '~/server/finance.functions'
import { FinanceTable } from '~/components/finance-table'
import { ParamSelect, SearchBox } from '~/components/list-toolbar'

export const Route = createFileRoute('/fleet/sales')({
  validateSearch: financeListSearchSchema,
  search: { middlewares: [stripSearchParams(financeListSearchDefaults)] },
  pendingMs: Infinity, // keep the current results on screen while a filter change loads
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listFinanceSales({ data: deps }),
  head: () => ({ meta: [{ title: 'Finance sales · Garage' }] }),
  component: FinanceSales,
})

function FinanceSales() {
  const search = Route.useSearch()
  const { items } = Route.useLoaderData()
  const overdue = items.filter((f) => f.overdue)
  const filtered = !!search.q || search.show !== 'all' || search.status !== 'active'

  const tiles = [
    [search.status === 'active' ? 'Active sales' : 'Sales', String(items.length)],
    ['Overdue', String(overdue.length)],
    ['Arrears', formatMoneyShort(overdue.reduce((s, f) => s + f.arrearsCents, 0))],
    ['Balance outstanding', formatMoneyShort(items.filter((f) => f.status === 'active').reduce((s, f) => s + f.balanceCents, 0))],
  ] as const

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Finance sales</h1>
        <Link to="/finance-sales/new" className="button">Start finance sale</Link>
      </div>

      <section className="tiles compact" aria-label="Totals">
        {tiles.map(([label, value]) => (
          <div key={label} className="panel tile">
            <span className="muted small">{label}</span>
            <span className="tile-value">{value}</span>
          </div>
        ))}
      </section>

      <div className="row wrap">
        <SearchBox from="/fleet/sales" q={search.q} placeholder="Search customer, phone or car…" />
        <ParamSelect from="/fleet/sales" param="status" label="Status" value={search.status}
          options={[['active', 'Active'], ['completed', 'Completed'], ['defaulted', 'Defaulted'], ['all', 'All sales']]} />
        <ParamSelect from="/fleet/sales" param="show" label="Show" value={search.show}
          options={[['all', 'Everyone'], ['overdue', 'Overdue only']]} />
        <ParamSelect from="/fleet/sales" param="sort" label="Sort" value={search.sort}
          options={[['arrears', 'Most behind first'], ['recent', 'Newest first'], ['start', 'Oldest first']]} />
      </div>

      {items.length === 0 ? (
        <div className="panel muted">
          {filtered ? 'No finance sales match these filters.' : 'No active finance sales. Start one from a Ready sale car.'}
        </div>
      ) : (
        <div className="panel flush">
          <FinanceTable sales={items} />
        </div>
      )}
    </div>
  )
}
