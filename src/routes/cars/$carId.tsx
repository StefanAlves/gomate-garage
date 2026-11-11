import { Link, createFileRoute, notFound, stripSearchParams, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { carTabSearchSchema, idSchema, type CAR_TABS } from '~/lib/schemas'
import {
  BUSINESS_OWNER, carName, carStatusLabel, categoryLabel, chargeStatusLabel, formatDate, formatKm, formatMoney,
  formatMoneyShort, formatPercent, formatSigned, methodLabel,
} from '~/lib/format'
import { deleteCar, getCar, listCustomerOptions, updateCar } from '~/server/garage.functions'
import { getCarFleetRecords, updateCarStock } from '~/server/fleet.functions'
import type { Charge } from '~/server/charges.server'
import { CarForm } from '~/components/car-form'
import { StockForm } from '~/components/stock-form'
import { DeleteButton, FormError } from '~/components/form'
import { ComingSoon, DetailTabs } from '~/components/tabs'

type TabKey = (typeof CAR_TABS)[number]

export const Route = createFileRoute('/cars/$carId')({
  validateSearch: carTabSearchSchema,
  search: { middlewares: [stripSearchParams({ tab: 'specs' })] },
  loader: async ({ params }) => {
    const parsed = idSchema.safeParse({ id: params.carId })
    if (!parsed.success) throw notFound()
    const [car, owners, records] = await Promise.all([
      getCar({ data: parsed.data }),
      listCustomerOptions(),
      getCarFleetRecords({ data: parsed.data }),
    ])
    return { car, owners, records }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.car.plate ?? 'Car'} · Garage` }] }),
  component: CarPage,
})

function CarPage() {
  const { car, records } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div className="stack">
      <Link to="/cars" className="muted small">← All cars</Link>

      <header className="stack tight">
        <div className="row wrap">
          <h1>{carName(car)}{car.variant && <span className="muted"> {car.variant}</span>}</h1>
          <span className={`badge status-${car.status}`}>{carStatusLabel[car.status]}</span>
          <span className="plate">{car.plate}</span>
          {car.writtenOff && <span className="badge urgent">Written off</span>}
        </div>
        <p className="muted small">
          Owner:{' '}
          {car.customerId == null ? (
            BUSINESS_OWNER
          ) : (
            <Link to="/customers/$customerId" params={{ customerId: String(car.customerId) }}>{car.ownerName}</Link>
          )}
          {' · '}Odometer {formatKm(car.mileageKm)}
        </p>
      </header>

      <MaintenanceSummary />

      <DetailTabs<TabKey>
        selected={tab}
        onChange={(t) => navigate({ search: { tab: t === 'specs' ? undefined : t }, replace: true })}
        tabs={[
          { id: 'specs', label: 'Specifications' },
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'Vehicle history' },
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

function MaintenanceSummary() {
  const { car } = Route.useLoaderData()
  const tiles = [
    ['Latest odometer', formatKm(car.mileageKm)],
    ['Next service', formatDate(car.nextServiceDate)],
    ['Next service km', formatKm(car.nextServiceKm)],
    ['Rego expiry', formatDate(car.regoExpiry)],
    ['Insurance expiry', formatDate(car.insuranceExpiry)],
  ] as const
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

function SpecsTab() {
  const { car, owners } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const update = useServerFn(updateCar)
  const remove = useServerFn(deleteCar)
  const [saved, setSaved] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()

  return (
    <section className="panel stack">
      {saved && <p className="notice" role="status">Saved.</p>}
      <CarForm
        key={car.updatedAt}
        owners={owners}
        initial={car}
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
    </section>
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
      <section className="panel stack">
        {saved && <p className="notice" role="status">Saved.</p>}
        {car.customerId != null && (
          <p className="notice">This car belongs to {car.ownerName}. Only business-owned cars appear on the Stock board.</p>
        )}
        <StockForm
          key={car.updatedAt}
          car={car}
          onSubmit={(values) => update({ data: { id: car.id, values } })}
          onSuccess={async () => {
            await router.invalidate()
            setSaved(true)
          }}
        />
      </section>
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
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Customer</th>{fine && <th>Offence</th>}<th className="hide-narrow">Notice #</th>
                <th className="num">Amount</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.incurredOn)}</td>
                  <td>{c.customerName ?? <span className="muted">Unknown</span>}</td>
                  {fine && <td>{c.offenceType ?? '—'}</td>}
                  <td className="hide-narrow">{c.noticeNumber ?? '—'}</td>
                  <td className="num">{formatMoney(c.amountCents)}</td>
                  <td><span className={`badge charge-${c.status}`}>{chargeStatusLabel[c.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Category</th><th className="num">Amount</th><th className="hide-narrow">Method</th><th className="hide-narrow">Notes</th></tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.occurredOn)}</td>
                    <td><span className={`category cat-${t.category}`}>{categoryLabel[t.category]}</span></td>
                    <td className="num">{formatMoney(t.amountCents)}</td>
                    <td className="hide-narrow">{t.method ? methodLabel[t.method] : '—'}</td>
                    <td className="hide-narrow muted small">{t.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
