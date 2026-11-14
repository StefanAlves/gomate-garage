import { createFileRoute, notFound, stripSearchParams, useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from 'react-aria-components/Button'
import { Cell, Column, Row, Table, TableBody, TableHeader } from 'react-aria-components/Table'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { carTabSearchSchema, idSchema, type CAR_TABS } from '~/lib/schemas'
import {
  carName, carPurposeLabel, carStatusLabel, categoryLabel, chargeStatusLabel, formatDate, formatKm, formatMoney,
  formatMoneyShort, formatPercent, formatSigned, methodLabel,
} from '~/lib/format'
import { deleteCar, getCar, updateCar } from '~/server/garage.functions'
import { getCarFleetRecords, updateCarStock } from '~/server/fleet.functions'
import { rentalsForCar } from '~/server/rentals.functions'
import { financeSalesForCar } from '~/server/finance.functions'
import { deleteReading, deleteService, getMaintenance } from '~/server/maintenance.functions'
import { DueDate, DueKm, IntervalForm, MaintenanceBadge, OdometerValue, ReadingForm, ServiceForm } from '~/components/maintenance'
import { FinanceTable } from '~/components/finance-table'
import { RentalTable } from '~/components/rental-table'
import type { Charge } from '~/server/charges.server'
import { CarForm } from '~/components/car-form'
import { StockForm } from '~/components/stock-form'
import { DeleteButton, FormError } from '~/components/form'
import { ComingSoon, DetailTabs } from '~/components/tabs'
import { Link } from '~/components/ui/link'

type TabKey = (typeof CAR_TABS)[number]

export const Route = createFileRoute('/cars/$carId')({
  validateSearch: carTabSearchSchema,
  search: { middlewares: [stripSearchParams({ tab: 'specs' })] },
  loader: async ({ params }) => {
    const parsed = idSchema.safeParse({ id: params.carId })
    if (!parsed.success) throw notFound()
    const [car, records, rentals, sales, maintenance] = await Promise.all([
      getCar({ data: parsed.data }),
      getCarFleetRecords({ data: parsed.data }),
      rentalsForCar({ data: parsed.data }),
      financeSalesForCar({ data: parsed.data }),
      getMaintenance({ data: parsed.data }),
    ])
    return { car, records, rentals, sales, maintenance }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.car.plate ?? 'Car'} · Garage` }] }),
  component: CarPage,
})

function CarPage() {
  const { car, records, rentals, sales } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const isRental = car.purpose === 'rental'
  const activeRental = rentals.find((r) => r.status === 'active')
  const currentSale = sales.find((f) => f.status === 'active') ?? sales.find((f) => f.status === 'completed')
  // Rental cars get Rentals and Maintenance; Sale cars get Finance and the (placeholder) vehicle history.
  const hidden: TabKey[] = isRental ? ['finance', 'history'] : ['rentals', 'maintenance']

  return (
    <div className="stack">
      <Link to="/cars" className="muted small">← All cars</Link>

      <header className="stack tight">
        <div className="row wrap">
          <h1>{carName(car)}{car.variant && <span className="muted"> {car.variant}</span>}</h1>
          <span className={`badge purpose-${car.purpose}`}>{carPurposeLabel[car.purpose]}</span>
          <span className={`badge status-${car.status}`}>{carStatusLabel[car.status]}</span>
          <span className="plate">{car.plate}</span>
          {car.writtenOff && <span className="badge urgent">Written off</span>}
        </div>
        {isRental && car.status === 'ready' && (
          <div><Link to="/rentals/new" search={{ car: car.id }} className="button">Start rental</Link></div>
        )}
        {!isRental && car.status === 'ready' && (
          <div><Link to="/finance-sales/new" search={{ car: car.id }} className="button">Start finance sale</Link></div>
        )}
        {currentSale && (
          <p className="small">
            {currentSale.status === 'active' ? 'Under finance to' : 'Sold to'} {currentSale.customerName} ·{' '}
            <Link to="/finance-sales/$saleId" params={{ saleId: String(currentSale.id) }}>Open finance sale →</Link>
          </p>
        )}
        {activeRental && (
          <p className="small">
            Rented to {activeRental.customerName} since {formatDate(activeRental.startDate)} ·{' '}
            <Link to="/rentals/$rentalId" params={{ rentalId: String(activeRental.id) }}>Open rental →</Link>
          </p>
        )}
        <p className="muted small">Odometer {formatKm(car.mileageKm)}</p>
      </header>

      <MaintenanceSummary />

      <DetailTabs<TabKey>
        selected={hidden.includes(tab) ? 'specs' : tab}
        onChange={(t) => navigate({ search: { tab: t === 'specs' ? undefined : t }, replace: true })}
        tabs={[
          { id: 'specs', label: 'Specifications' },
          { id: 'stock', label: 'Stock' },
          isRental
            ? { id: 'rentals' as const, label: 'Rentals', count: rentals.length }
            : { id: 'finance' as const, label: 'Finance', count: sales.length },
          isRental
            ? { id: 'maintenance' as const, label: 'Maintenance' }
            : { id: 'history' as const, label: 'Vehicle history' },
          { id: 'fines', label: 'Fines', count: records.fines.length },
          { id: 'tolls', label: 'Tolls', count: records.tolls.length },
          { id: 'money', label: 'Money', count: records.transactions.length },
          { id: 'reminders', label: 'Reminders' },
          { id: 'invoices', label: 'Invoices' },
          { id: 'log', label: 'Log' },
        ]}
        render={(key) => {
          switch (key) {
            case 'specs':
              return <SpecsTab />
            case 'stock':
              return <StockTab />
            case 'rentals':
              return (
                <section className="panel stack">
                  <h2>Rentals</h2>
                  {rentals.length === 0 ? <p className="muted">This car hasn't been rented yet.</p> : <RentalTable rentals={rentals} hide="car" />}
                </section>
              )
            case 'finance':
              return (
                <section className="panel stack">
                  <h2>Finance sales</h2>
                  {sales.length === 0 ? <p className="muted">This car hasn't been sold yet.</p> : <FinanceTable sales={sales} hide="car" />}
                </section>
              )
            case 'maintenance':
              return <MaintenanceTab />
            case 'history':
              return <ComingSoon title="Vehicle history">Every workshop booking for this car, newest first.</ComingSoon>
            case 'fines':
              return <ChargeList kind="fine" charges={records.fines} />
            case 'tolls':
              return <ChargeList kind="toll" charges={records.tolls} />
            case 'money':
              return <MoneyTab />
            case 'reminders':
              return <ComingSoon title="Service reminders">Automatic 30-day and 7-day service reminders by email, SMS or WhatsApp, and the history of reminders sent.</ComingSoon>
            case 'invoices':
              return <ComingSoon title="Invoices">Sale and service invoices for this car.</ComingSoon>
            case 'log':
              return (
                <section className="panel stack">
                  <h2>Activity</h2>
                  <dl className="dl">
                    <dt>Created</dt>
                    <dd>{formatDate(car.createdAt)}</dd>
                    <dt>Last updated</dt>
                    <dd>{formatDate(car.updatedAt)}</dd>
                  </dl>
                  <p className="muted small">A full change log (who changed what) comes with the activity module.</p>
                </section>
              )
          }
        }}
      />
    </div>
  )
}

/** Header tiles. Rental cars show the worked-out next service; Sale cars the typed-in one. */
function MaintenanceSummary() {
  const { car, maintenance } = Route.useLoaderData()
  const { due } = maintenance
  const tiles = car.purpose === 'rental'
    ? ([
        ['Latest odometer', <OdometerValue key="odo" due={due} />],
        ['Next service', <DueDate key="date" due={due} />],
        ['Next service km', <DueKm key="km" due={due} />],
        ['Service', <MaintenanceBadge key="state" state={due.state} />],
        ['Rego expiry', formatDate(car.regoExpiry)],
        ['Insurance expiry', formatDate(car.insuranceExpiry)],
      ] as const)
    : ([
        ['Latest odometer', formatKm(car.mileageKm)],
        ['Next service', formatDate(car.nextServiceDate)],
        ['Next service km', formatKm(car.nextServiceKm)],
        ['Rego expiry', formatDate(car.regoExpiry)],
        ['Insurance expiry', formatDate(car.insuranceExpiry)],
      ] as const)
  return (
    <section className="tiles compact" aria-label="Maintenance tracking">
      {tiles.map(([label, value]) => (
        <div key={label} className="panel tile">
          <span className="muted small">{label}</span>
          <span className="tile-value">{value}</span>
        </div>
      ))}
    </section>
  )
}

type MaintenancePanel = 'reading' | 'service' | 'interval' | null

/** Rental cars: service interval, odometer readings and services. */
function MaintenanceTab() {
  const { car, maintenance } = Route.useLoaderData()
  const { interval, readings, services, due, today } = maintenance
  const router = useRouter()
  const removeReading = useServerFn(deleteReading)
  const removeService = useServerFn(deleteService)
  const [panel, setPanel] = useState<MaintenancePanel>(null)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const done = (message: string) => async () => {
    setPanel(null)
    setNotice(message)
    setError(undefined)
    await router.invalidate()
  }
  const hasInterval = interval.km != null || interval.months != null
  const intervalText = [interval.km && `every ${formatKm(interval.km)}`, interval.months && `every ${interval.months} months`]
    .filter(Boolean).join(' or ')

  return (
    <div className="stack">
      {notice && <p className="notice" role="status">{notice}</p>}
      <FormError error={error} />

      <section className="panel stack">
        <div className="row between wrap">
          <h2>Service interval</h2>
          {hasInterval && panel !== 'interval' && (
            <Button className="ghost" onPress={() => setPanel('interval')}>Change</Button>
          )}
        </div>
        {panel === 'interval' || !hasInterval ? (
          <IntervalForm carId={car.id} interval={interval} onDone={done('Service interval saved.')}
            onCancel={panel === 'interval' ? () => setPanel(null) : undefined} />
        ) : (
          <p>Service {intervalText}, whichever comes first. <MaintenanceBadge state={due.state} /></p>
        )}
      </section>

      <div className="row wrap">
        <Button onPress={() => setPanel('reading')}>Add reading</Button>
        <Button className="ghost" onPress={() => setPanel('service')}>Record service</Button>
      </div>
      {panel === 'reading' && (
        <section className="panel stack">
          <h2>Add odometer reading</h2>
          <ReadingForm carId={car.id} today={today} onDone={done('Reading saved.')} onCancel={() => setPanel(null)} />
        </section>
      )}
      {panel === 'service' && (
        <section className="panel stack">
          <h2>Record service</h2>
          <ServiceForm carId={car.id} today={today} km={due.latest?.km ?? null} onDone={done('Service saved. The countdown has restarted.')}
            onCancel={() => setPanel(null)} />
        </section>
      )}

      <div className="two-col">
        <section className="panel stack">
          <h2>Services</h2>
          {services.length === 0 ? (
            <p className="muted">No services recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <Table className="data-table" aria-label="Services">
                <TableHeader><Column>Date</Column><Column className="num">Km</Column><Column>Work</Column><Column className="num">Cost</Column><Column aria-label="Delete" /></TableHeader>
                <TableBody>
                  {services.map((v) => (
                    <Row key={v.id} id={v.id}>
                      <Cell className="nowrap">{formatDate(v.servicedOn)}</Cell>
                      <Cell className="num">{v.km.toLocaleString('en-AU')}</Cell>
                      <Cell>{v.description}</Cell>
                      <Cell className="num">{v.costCents ? formatMoney(v.costCents) : '—'}</Cell>
                      <Cell>
                        <DeleteButton label="Delete" onConfirm={async () => {
                          await removeService({ data: { id: v.id } })
                          await done('Service deleted, with its reading and expense.')()
                        }} />
                      </Cell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="panel stack">
          <h2>Odometer readings</h2>
          {readings.length === 0 ? (
            <p className="muted">No readings yet. Add one whenever the renter sends a dashboard photo.</p>
          ) : (
            <div className="table-wrap">
              <Table className="data-table" aria-label="Odometer readings">
                <TableHeader><Column>Date</Column><Column className="num">Km</Column><Column>From</Column><Column aria-label="Delete" /></TableHeader>
                <TableBody>
                  {readings.map((r, i) => {
                    const prev = readings[i + 1]
                    const lower = prev && r.km < prev.km
                    return (
                      <Row key={r.id} id={r.id}>
                        <Cell className="nowrap">{formatDate(r.readOn)}</Cell>
                        <Cell className={`num ${lower ? 'urgent' : ''}`}>
                          <span title={lower ? 'Lower than the reading before it (correction)' : undefined}>{r.km.toLocaleString('en-AU')}</span>{prev && !lower && <div className="muted small">+{(r.km - prev.km).toLocaleString('en-AU')}</div>}
                        </Cell>
                        <Cell className="small">
                          {r.serviceId ? 'Service' : r.rentalId ? (
                            <Link to="/rentals/$rentalId" params={{ rentalId: String(r.rentalId) }}>Rental</Link>
                          ) : <span className="muted">—</span>}
                          {r.note && <div className="muted">{r.note}</div>}
                        </Cell>
                        <Cell>
                          {!r.serviceId && (
                            <DeleteButton label="Delete" onConfirm={async () => {
                              const res = await removeReading({ data: { id: r.id } })
                              if (res.ok) await done('Reading deleted.')()
                              else setError(res.errors.form)
                            }} />
                          )}
                        </Cell>
                      </Row>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SpecsTab() {
  const { car } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const update = useServerFn(updateCar)
  const remove = useServerFn(deleteCar)
  const [saved, setSaved] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()

  return (
    <div className="stack">
      {saved && <p className="notice" role="status">Saved.</p>}
      <CarForm
        key={car.updatedAt}
        initial={car}
        purpose={car.purpose}
        submitLabel="Save changes"
        onSubmit={(values) => update({ data: { id: car.id, values } })}
        onSuccess={async () => {
          await router.invalidate()
          setSaved(true)
        }}
      >
        <DeleteButton
          label="Delete car"
          onConfirm={async () => {
            const res = await remove({ data: { id: car.id } })
            if (res.ok) await navigate({ to: '/cars' })
            else setDeleteError(res.errors.form)
          }}
        />
      </CarForm>
      <FormError error={deleteError} />
    </div>
  )
}

function StockTab() {
  const { car, records } = Route.useLoaderData()
  const router = useRouter()
  const update = useServerFn(updateCarStock)
  const [saved, setSaved] = useState(false)
  const { totals } = records

  return (
    <div className="two-col wide-left">
      <div className="stack">
        {saved && <p className="notice" role="status">Saved.</p>}
        <StockForm
          key={car.updatedAt}
          car={car}
          onSubmit={(values) => update({ data: { id: car.id, values } })}
          onSuccess={async () => {
            await router.invalidate()
            setSaved(true)
          }}
        />
      </div>
      <div className="stack">
        <section className="panel stack">
          <div className="row between">
            <h2>Compliance</h2>
            <Link from={Route.fullPath} search={{ tab: undefined }} className="small">Edit</Link>
          </div>
          <dl className="dl">
            <dt>Rego</dt><dd>{car.plate} · expires {formatDate(car.regoExpiry)}</dd>
            <dt>Insurance</dt><dd>{car.insuranceProvider ?? '—'}{car.insurancePolicy ? ` · ${car.insurancePolicy}` : ''}</dd>
            <dt>Insurance expiry</dt><dd>{formatDate(car.insuranceExpiry)}</dd>
            <dt>PPSR checked</dt><dd>{car.ppsrChecked ? 'Yes' : 'No'}</dd>
            <dt>Written off</dt><dd>{car.writtenOff ? 'Yes' : 'No'}</dd>
          </dl>
        </section>
        <section className="panel stack">
          <h2>Financial summary</h2>
          <dl className="dl">
            <dt>Total invested</dt><dd>{formatMoney(totals.investedCents + totals.expensesCents)}</dd>
            <dt>Total income</dt><dd>{formatMoney(totals.rentalIncomeCents + totals.saleIncomeCents)}</dd>
            <dt>Profit / loss</dt><dd className={totals.pnlCents < 0 ? 'urgent' : 'positive'}>{formatSigned(totals.pnlCents)}</dd>
            <dt>ROI</dt><dd>{formatPercent(totals.roi)}</dd>
          </dl>
          <Link from={Route.fullPath} search={{ tab: 'money' }} className="small">View transactions →</Link>
        </section>
      </div>
    </div>
  )
}

function ChargeList({ kind, charges }: { kind: 'fine' | 'toll'; charges: Charge[] }) {
  const fine = kind === 'fine'
  const total = charges.reduce((sum, c) => sum + c.amountCents, 0)
  return (
    <section className="panel stack">
      <div className="row between wrap">
        <h2>{fine ? 'Fines' : 'Tolls'}</h2>
        <Link to={fine ? '/fleet/fines' : '/fleet/tolls'} className="button ghost">Manage {fine ? 'fines' : 'tolls'}</Link>
      </div>
      {charges.length === 0 ? (
        <p className="muted">No {fine ? 'fines' : 'tolls'} recorded for this car.</p>
      ) : (
        <div className="table-wrap">
          <Table className="data-table" aria-label={fine ? 'Fines' : 'Tolls'}>
            <TableHeader>
                <Column>Date</Column><Column>Customer</Column>{fine && <Column>Offence</Column>}<Column className="hide-narrow">Notice #</Column>
                <Column className="num">Amount</Column><Column>Status</Column>
              </TableHeader>
            <TableBody>
              {charges.map((c) => (
                <Row key={c.id} id={c.id}>
                  <Cell>{formatDate(c.incurredOn)}</Cell>
                  <Cell>{c.customerName ?? <span className="muted">Unknown</span>}</Cell>
                  {fine && <Cell>{c.offenceType ?? '—'}</Cell>}
                  <Cell className="hide-narrow">{c.noticeNumber ?? '—'}</Cell>
                  <Cell className="num">{formatMoney(c.amountCents)}</Cell>
                  <Cell><span className={`badge charge-${c.status}`}>{chargeStatusLabel[c.status]}</span></Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
          <p className="muted small table-foot">{charges.length} · {formatMoney(total)}</p>
        </div>
      )}
    </section>
  )
}

function MoneyTab() {
  const { car, records } = Route.useLoaderData()
  const { totals, transactions } = records
  const tiles = [
    ['Invested', formatMoneyShort(totals.investedCents)],
    ['Expenses', formatMoneyShort(totals.expensesCents)],
    ['Rental income', formatMoneyShort(totals.rentalIncomeCents)],
    ['Sale income', formatMoneyShort(totals.saleIncomeCents)],
    ['P&L', formatSigned(totals.pnlCents)],
    ['Bond held', formatMoneyShort(totals.bondHeldCents)],
  ] as const
  return (
    <div className="stack">
      <section className="tiles compact" aria-label="Totals">
        {tiles.map(([label, value]) => (
          <div key={label} className="panel tile">
            <span className="muted small">{label}</span>
            <span className="tile-value">{value}</span>
          </div>
        ))}
      </section>
      <section className="panel stack">
        <div className="row between wrap">
          <h2>Transactions</h2>
          <Link to="/fleet/transactions" search={{ car: car.id }} className="button ghost">Add or edit in Transactions</Link>
        </div>
        {transactions.length === 0 ? (
          <p className="muted">No money recorded for this car yet.</p>
        ) : (
          <div className="table-wrap">
            <Table className="data-table" aria-label="Transactions">
              <TableHeader><Column>Date</Column><Column>Category</Column><Column className="num">Amount</Column><Column className="hide-narrow">Method</Column><Column className="hide-narrow">Notes</Column></TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <Row key={t.id} id={t.id}>
                    <Cell>{formatDate(t.occurredOn)}</Cell>
                    <Cell><span className={`category cat-${t.category}`}>{categoryLabel[t.category]}</span></Cell>
                    <Cell className="num">{formatMoney(t.amountCents)}</Cell>
                    <Cell className="hide-narrow">{t.method ? methodLabel[t.method] : '—'}</Cell>
                    <Cell className="hide-narrow muted small">{t.notes}</Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
