import { Link, createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { maintenanceListSearchDefaults, maintenanceListSearchSchema } from '~/lib/schemas'
import { DUE_SOON_DAYS, DUE_SOON_KM } from '~/lib/maintenance'
import { carStatusLabel, formatDate, whatsappUrl } from '~/lib/format'
import { listMaintenance } from '~/server/maintenance.functions'
import { DueDate, DueKm, MaintenanceBadge, OdometerValue } from '~/components/maintenance'
import { ParamSelect } from '~/components/list-toolbar'

export const Route = createFileRoute('/fleet/maintenance')({
  validateSearch: maintenanceListSearchSchema,
  search: { middlewares: [stripSearchParams(maintenanceListSearchDefaults)] },
  pendingMs: Infinity, // keep the current results on screen while a filter change loads
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listMaintenance({ data: deps }),
  head: () => ({ meta: [{ title: 'Maintenance · Garage' }] }),
  component: Maintenance,
})

function Maintenance() {
  const { show } = Route.useSearch()
  const { items, counts } = Route.useLoaderData()

  const tiles = [
    ['Overdue', counts.overdue, 'urgent'],
    ['Due soon', counts.dueSoon, undefined],
    ['No interval set', counts.noInterval, undefined],
  ] as const

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>Maintenance</h1>
        <ParamSelect from="/fleet/maintenance" param="show" label="Show" value={show}
          options={[['due', 'Overdue or due soon'], ['all', 'All rental cars']]} />
      </div>
      <p className="muted small">
        Rental cars overdue for a service, or due within {DUE_SOON_DAYS} days or {DUE_SOON_KM.toLocaleString('en-AU')} km.
        When the latest reading is a week old or more, the km left uses an estimate from recent readings.
      </p>

      <section className="tiles compact" aria-label="Counts">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className="panel tile">
            <span className="muted small">{label}</span>
            <span className={`tile-value ${value && tone ? tone : ''}`}>{value}</span>
          </div>
        ))}
      </section>

      {items.length === 0 ? (
        <div className="panel muted">
          {show === 'due' ? 'No rental car is due for a service in the next 30 days.' : 'No rental cars yet.'}
          {counts.noInterval > 0 && show === 'due' && (
            <> {counts.noInterval} without a service interval: <Link to="/fleet/maintenance" search={{ show: 'all' }}>show all</Link>.</>
          )}
        </div>
      ) : (
        <div className="panel flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Car</th><th>Renter</th><th className="hide-narrow">Odometer</th><th className="hide-narrow">Last service</th>
                  <th>Next by date</th><th>Next by km</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const wa = c.renterPhone ? whatsappUrl(c.renterPhone) : null
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to="/cars/$carId" params={{ carId: String(c.id) }} search={{ tab: 'maintenance' }}>
                          {c.name} <span className="plate">{c.plate}</span>
                        </Link>
                      </td>
                      <td>
                        {c.renterName ? (
                          <>
                            <Link to="/rentals/$rentalId" params={{ rentalId: String(c.rentalId) }}>{c.renterName}</Link>
                            <div className="small">
                              <a href={`tel:${c.renterPhone}`}>{c.renterPhone}</a>
                              {wa && <> · <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a></>}
                            </div>
                          </>
                        ) : (
                          <span className="muted small">{carStatusLabel[c.status]}, at the garage</span>
                        )}
                      </td>
                      <td className="hide-narrow small"><OdometerValue due={c.due} /></td>
                      <td className="hide-narrow">{c.lastServiceOn ? formatDate(c.lastServiceOn) : <span className="muted">None</span>}</td>
                      <td><DueDate due={c.due} /></td>
                      <td><DueKm due={c.due} /></td>
                      <td><MaintenanceBadge state={c.due.state} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
