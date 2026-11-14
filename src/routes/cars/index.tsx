import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { Cell, Column, Row, Table, TableBody, TableHeader } from 'react-aria-components/Table'
import { CAR_PURPOSES, CAR_STATUSES, carListSearchDefaults, carListSearchSchema } from '~/lib/schemas'
import { carName, carPurposeLabel, carStatusLabel, formatDate } from '~/lib/format'
import { attentionLabel, carAttention, expiryState, type AttentionFlag } from '~/lib/attention'
import { listCars } from '~/server/garage.functions'
import { Pager, ParamSelect, SearchBox, useSetSearch } from '~/components/list-toolbar'
import { Checkbox } from '~/components/ui/checkbox'
import { Link } from '~/components/ui/link'

export const Route = createFileRoute('/cars/')({
  validateSearch: carListSearchSchema,
  search: { middlewares: [stripSearchParams(carListSearchDefaults)] },
  pendingMs: Infinity, // keep the current results on screen while a filter change loads
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listCars({ data: deps }),
  head: () => ({ meta: [{ title: 'Cars · Garage' }] }),
  component: CarList,
})

const sortOptions = [
  ['urgent', 'Most urgent'],
  ['rego_expiry', 'Rego expiry, soonest'],
  ['plate', 'Plate A–Z'],
  ['recent', 'Recently added'],
  ['make_asc', 'Make A–Z'],
] as const
const purposeOptions = [['', 'All purposes'] as const, ...CAR_PURPOSES.map((p) => [p, carPurposeLabel[p]] as const)]
const statusOptions = [['', 'All statuses'] as const, ...CAR_STATUSES.map((s) => [s, carStatusLabel[s]] as const)]

function CarList() {
  const { q, sort, purpose, status, attention, size } = Route.useSearch()
  const { items, total, attentionCount, page, pageCount, today } = Route.useLoaderData()
  const setSearch = useSetSearch('/cars/')
  const filtered = !!q || purpose !== undefined || status !== undefined || !!attention

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>
          Cars <span className="muted">({total})</span>
          {attentionCount > 0 && !attention && (
            <>
              {' '}<span className="muted">·</span>{' '}
              <Link from="/cars/" search={(p) => ({ ...p, attention: true, page: undefined })} replace className="small urgent">
                {attentionCount} need{attentionCount === 1 ? 's' : ''} attention
              </Link>
            </>
          )}
        </h1>
        <Link to="/cars/new" className="button">New car</Link>
      </div>
      <div className="row wrap">
        <SearchBox from="/cars/" q={q} placeholder="Search rego, make, model or VIN…" />
        <ParamSelect from="/cars/" param="sort" label="Sort" value={sort} options={sortOptions} />
        <ParamSelect from="/cars/" param="purpose" label="Purpose" value={purpose ?? ''} options={purposeOptions} />
        <ParamSelect from="/cars/" param="status" label="Status" value={status ?? ''} options={statusOptions} />
        <Checkbox isSelected={!!attention} onChange={(checked) => setSearch({ attention: checked || undefined })}>
          Needs attention only
        </Checkbox>
      </div>
      {items.length === 0 ? (
        <div className="panel muted">
          {filtered ? 'No cars match these filters.' : <>No cars yet. <Link to="/cars/new">Register the first one</Link>.</>}
        </div>
      ) : (
        <div className="table-wrap panel flush">
          <Table aria-label="Cars" className="data-table">
            <TableHeader>
              <Column isRowHeader>Vehicle</Column>
              <Column>Rego</Column>
              <Column className="hide-narrow">Colour</Column>
              <Column className="hide-narrow">Purpose</Column>
              <Column>Status</Column>
              <Column>Needs attention</Column>
            </TableHeader>
            <TableBody>
              {items.map((car) => (
                <Row key={car.id} id={car.id}>
                  <Cell>
                    <Link to="/cars/$carId" params={{ carId: String(car.id) }}>
                      <strong>{car.year ? `${car.year} ` : ''}{car.make}</strong>
                      <span className="muted small block">{car.model}{car.variant ? ` ${car.variant}` : ''}</span>
                    </Link>
                  </Cell>
                  <Cell>
                    <span className="plate">{car.plate}</span>
                    {car.regoExpiry && (
                      <span className={`small block expiry-${car.status === 'sold' ? 'none' : expiryState(car.regoExpiry, today) ?? 'none'}`}>
                        {formatDate(car.regoExpiry)}
                      </span>
                    )}
                  </Cell>
                  <Cell className="hide-narrow">{car.color ?? <span className="muted">—</span>}</Cell>
                  <Cell className="hide-narrow"><span className={`badge purpose-${car.purpose}`}>{carPurposeLabel[car.purpose]}</span></Cell>
                  <Cell>
                    <span className={`badge status-${car.status}`} title={carName(car)}>{carStatusLabel[car.status]}</span>
                  </Cell>
                  <Cell>
                    <AttentionChip flag={carAttention(car, today)} />
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager from="/cars/" page={page} pageCount={pageCount} shown={items.length} total={total} size={size} />
    </div>
  )
}

function AttentionChip({ flag }: { flag: AttentionFlag | null }) {
  if (!flag) return null
  return <span className={`badge attention expiry-${flag.state}`}>{attentionLabel(flag)}</span>
}
