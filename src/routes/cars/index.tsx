import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { carListSearchDefaults, carListSearchSchema } from '~/lib/schemas'
import { BUSINESS_OWNER, carName, carStatusLabel } from '~/lib/format'
import { listCars, listCustomerOptions } from '~/server/garage.functions'
import { Pager, ParamSelect, SearchBox } from '~/components/list-toolbar'

export const Route = createFileRoute('/cars/')({
  validateSearch: carListSearchSchema,
  search: { middlewares: [stripSearchParams(carListSearchDefaults)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [list, owners] = await Promise.all([listCars({ data: deps }), listCustomerOptions()])
    return { ...list, owners }
  },
  head: () => ({ meta: [{ title: 'Cars · Garage' }] }),
  component: CarList,
})

const sortOptions = [
  ['recent', 'Recently added'],
  ['oldest', 'Oldest first'],
  ['make_asc', 'Make A–Z'],
  ['make_desc', 'Make Z–A'],
] as const

function CarList() {
  const { q, sort, owner, size } = Route.useSearch()
  const { items, total, page, pageCount, owners } = Route.useLoaderData()
  const ownerOptions = [
    ['', 'All owners'] as const,
    ['business', BUSINESS_OWNER] as const,
    ...owners.map((o) => [String(o.id), o.name] as const),
  ]
  const filtered = !!q || owner !== undefined

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Cars <span className="muted">({total})</span></h1>
        <Link to="/cars/new" className="button">New car</Link>
      </div>
      <div className="row wrap">
        <SearchBox from="/cars/" q={q} placeholder="Search rego, make, model, VIN or owner…" />
        <ParamSelect from="/cars/" param="sort" label="Sort" value={sort} options={sortOptions} />
        <ParamSelect from="/cars/" param="owner" label="Owner" value={owner === undefined ? '' : String(owner)} options={ownerOptions} />
      </div>
      {items.length === 0 ? (
        <div className="panel muted">
          {filtered ? 'No cars match these filters.' : <>No cars yet. <Link to="/cars/new">Register the first one</Link>.</>}
        </div>
      ) : (
        <div className="table-wrap panel flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Rego</th>
                <th className="hide-narrow">Colour</th>
                <th>Owner</th>
                <th className="hide-narrow">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((car) => (
                <tr key={car.id}>
                  <td>
                    <Link to="/cars/$carId" params={{ carId: String(car.id) }}>
                      <strong>{car.year ? `${car.year} ` : ''}{car.make}</strong>
                      <span className="muted small block">{car.model}{car.variant ? ` ${car.variant}` : ''}</span>
                    </Link>
                  </td>
                  <td><span className="plate">{car.plate}</span></td>
                  <td className="hide-narrow">{car.color ?? <span className="muted">—</span>}</td>
                  <td>
                    {car.customerId == null ? (
                      <span className="muted">{BUSINESS_OWNER}</span>
                    ) : (
                      <Link to="/customers/$customerId" params={{ customerId: String(car.customerId) }}>{car.ownerName}</Link>
                    )}
                  </td>
                  <td className="hide-narrow">
                    <span className={`badge status-${car.status}`} title={carName(car)}>{carStatusLabel[car.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager from="/cars/" page={page} pageCount={pageCount} shown={items.length} total={total} size={size} />
    </div>
  )
}
