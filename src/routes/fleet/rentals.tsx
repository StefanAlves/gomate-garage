import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { rentalListSearchDefaults, rentalListSearchSchema } from '~/lib/schemas'
import { formatMoneyShort } from '~/lib/format'
import { listRentals } from '~/server/rentals.functions'
import { RentalTable } from '~/components/rental-table'
import { ParamSelect, SearchBox } from '~/components/list-toolbar'

export const Route = createFileRoute('/fleet/rentals')({
  validateSearch: rentalListSearchSchema,
  search: { middlewares: [stripSearchParams(rentalListSearchDefaults)] },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listRentals({ data: deps }),
  head: () => ({ meta: [{ title: 'Rentals · Garage' }] }),
  component: Rentals,
})

function Rentals() {
  const search = Route.useSearch()
  const { items } = Route.useLoaderData()
  const behind = items.filter((r) => r.owedCents > 0)
  const owed = behind.reduce((sum, r) => sum + r.owedCents, 0)
  const filtered = !!search.q || search.show !== 'all' || search.status !== 'active'

  const tiles = [
    [search.status === 'active' ? 'Active rentals' : 'Rentals', String(items.length)],
    ['Behind', String(behind.length)],
    [search.status === 'returned' ? 'Shortfalls owed' : 'Owed', formatMoneyShort(owed)],
  ] as const

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Rentals</h1>
        <Link to="/rentals/new" className="button">Start rental</Link>
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
        <SearchBox from="/fleet/rentals" q={search.q} placeholder="Search customer, phone or car…" />
        <ParamSelect from="/fleet/rentals" param="status" label="Status" value={search.status}
          options={[['active', 'Active'], ['returned', 'Returned'], ['all', 'All rentals']]} />
        <ParamSelect from="/fleet/rentals" param="show" label="Show" value={search.show}
          options={[['all', 'Everyone'], ['behind', 'Behind on payments']]} />
        <ParamSelect from="/fleet/rentals" param="sort" label="Sort" value={search.sort}
          options={[['arrears', 'Most owed first'], ['recent', 'Newest first'], ['start', 'Oldest first']]} />
      </div>

      {items.length === 0 ? (
        <div className="panel muted">
          {filtered ? 'No rentals match these filters.' : 'No active rentals. Start one from a Ready rental car.'}
        </div>
      ) : (
        <div className="panel flush">
          <RentalTable rentals={items} />
        </div>
      )}
    </div>
  )
}
