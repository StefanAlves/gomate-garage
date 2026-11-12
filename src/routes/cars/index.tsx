import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { CAR_PURPOSES, CAR_STATUSES, carListSearchDefaults, carListSearchSchema } from '~/lib/schemas'
import { carName, carPurposeLabel, carStatusLabel } from '~/lib/format'
import { listCars } from '~/server/garage.functions'
import { Pager, ParamSelect, SearchBox } from '~/components/list-toolbar'

export const Route = createFileRoute('/cars/')({
  validateSearch: carListSearchSchema,
  search: { middlewares: [stripSearchParams(carListSearchDefaults)] },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listCars({ data: deps }),
  head: () => ({ meta: [{ title: 'Cars · Garage' }] }),
  component: CarList,
})

const sortOptions = [
  ['recent', 'Recently added'],
  ['oldest', 'Oldest first'],
  ['make_asc', 'Make A–Z'],
  ['make_desc', 'Make Z–A'],
] as const
const purposeOptions = [['', 'All purposes'] as const, ...CAR_PURPOSES.map((p) => [p, carPurposeLabel[p]] as const)]
const statusOptions = [['', 'All statuses'] as const, ...CAR_STATUSES.map((s) => [s, carStatusLabel[s]] as const)]

function CarList() {
  const { q, sort, purpose, status, size } = Route.useSearch()
  const { items, total, page, pageCount } = Route.useLoaderData()
  const filtered = !!q || purpose !== undefined || status !== undefined

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Cars <span className="muted">({total})</span></h1>
        <Link to="/cars/new" className="button">New car</Link>
      </div>
      <div className="row wrap">
        <SearchBox from="/cars/" q={q} placeholder="Search rego, make, model or VIN…" />
        <ParamSelect from="/cars/" param="sort" label="Sort" value={sort} options={sortOptions} />
        <ParamSelect from="/cars/" param="purpose" label="Purpose" value={purpose ?? ''} options={purposeOptions} />
        <ParamSelect from="/cars/" param="status" label="Status" value={status ?? ''} options={statusOptions} />
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
                <th>Purpose</th>
                <th>Status</th>
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
                  <td><span className={`badge purpose-${car.purpose}`}>{carPurposeLabel[car.purpose]}</span></td>
                  <td>
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
