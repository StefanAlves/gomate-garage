import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { idSchema, rentChangeInputSchema, rentPaymentInputSchema } from '~/lib/schemas'
import {
  categoryLabel, centsToInput, deductionKindLabel, formatDate, formatMoney, labelOptions, methodLabel,
} from '~/lib/format'
import { adjustRent, getRental, recordRentPayment } from '~/server/rentals.functions'
import { OwedCell, RentalStatusBadge } from '~/components/rental-table'
import { ReturnRental } from '~/components/return-rental'
import { FormError, useSchemaForm } from '~/components/form'

export const Route = createFileRoute('/rentals/$rentalId')({
  loader: ({ params }) => {
    const parsed = idSchema.safeParse({ id: params.rentalId })
    if (!parsed.success) throw notFound()
    return getRental({ data: parsed.data })
  },
  head: ({ loaderData }) => ({ meta: [{ title: `Rental · ${loaderData?.rental.carPlate ?? ''} · Garage` }] }),
  component: RentalPage,
})

type Panel = 'payment' | 'rent' | 'return' | null
const methodOptions = labelOptions(methodLabel)

function RentalPage() {
  const { rental, rates, payments, deductions, today } = Route.useLoaderData()
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<string>()
  const active = rental.status === 'active'

  const done = (message: string) => async () => {
    setPanel(null)
    setNotice(message)
    await router.invalidate()
  }

  const tiles = [
    ['Weekly rent', formatMoney(rental.weeklyCents)],
    [active ? 'Arrears' : 'Owed', <OwedCell key="owed" rental={rental} />],
    ['Paid to date', formatMoney(rental.rentPaidCents)],
    ['Next due', rental.nextDueOn ? formatDate(rental.nextDueOn) : '—'],
    ['Bond held', formatMoney(rental.bondHeldCents)],
  ] as const

  return (
    <div className="stack">
      <Link to="/fleet/rentals" className="muted small">← Rentals</Link>
      <header className="stack tight">
        <div className="row wrap">
          <h1>Rental · {rental.carName}</h1>
          <span className="plate">{rental.carPlate}</span>
          <RentalStatusBadge status={rental.status} />
        </div>
        <p className="muted small">
          <Link to="/customers/$customerId" params={{ customerId: String(rental.customerId) }} search={{ tab: 'rentals' }}>
            {rental.customerName}
          </Link>{' '}
          · {rental.customerPhone} · started {formatDate(rental.startDate)}
          {rental.returnedOn && <> · returned {formatDate(rental.returnedOn)}</>} ·{' '}
          <Link to="/cars/$carId" params={{ carId: String(rental.carId) }} search={{ tab: 'rentals' }}>view car</Link>
        </p>
      </header>

      <section className="tiles compact" aria-label="Summary">
        {tiles.map(([label, value]) => (
          <div key={label} className="panel tile">
            <span className="muted small">{label}</span>
            <span className="tile-value">{value}</span>
          </div>
        ))}
      </section>

      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="row wrap">
        {(active || rental.owedCents > 0) && (
          <button type="button" onClick={() => setPanel('payment')}>Record payment</button>
        )}
        {active && <button type="button" className="ghost" onClick={() => setPanel('rent')}>Change rent</button>}
        {active && <button type="button" className="ghost" onClick={() => setPanel('return')}>Return car</button>}
      </div>

      {panel === 'payment' && (
        <section className="panel stack">
          <h2>Record payment</h2>
          <PaymentForm onDone={done('Payment recorded.')} onCancel={() => setPanel(null)} />
        </section>
      )}
      {panel === 'rent' && (
        <section className="panel stack">
          <h2>Change weekly rent</h2>
          <p className="muted small">Weeks due before the date keep their old rent.</p>
          <RentChangeForm onDone={done('Rent updated.')} onCancel={() => setPanel(null)} />
        </section>
      )}
      {panel === 'return' && (
        <section className="panel stack">
          <h2>Return car and settle bond</h2>
          <ReturnRental rentalId={rental.id} today={today} onDone={done('Car returned. It is back in Preparation.')}
            onCancel={() => setPanel(null)} />
        </section>
      )}

      <div className="two-col wide-left">
        <section className="panel stack">
          <h2>Payments and bond</h2>
          {payments.length === 0 ? (
            <p className="muted">No payments recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Type</th><th className="num">Amount</th><th className="hide-narrow">Method</th><th className="hide-narrow">Notes</th></tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.occurredOn)}</td>
                      <td><span className={`category cat-${p.category}`}>{p.category === 'rental_income' ? 'Rent' : categoryLabel[p.category]}</span></td>
                      <td className="num">{formatMoney(p.amountCents)}</td>
                      <td className="hide-narrow">{p.method ? methodLabel[p.method] : '—'}</td>
                      <td className="hide-narrow muted small">{p.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">Rent due to date {formatMoney(rental.rentDueCents)} · paid {formatMoney(rental.rentPaidCents)}</p>
        </section>

        <div className="stack">
          <section className="panel stack">
            <h2>Rent history</h2>
            <dl className="dl">
              {rates.map((r) => (
                <div key={r.effectiveFrom} className="contents">
                  <dt>From {formatDate(r.effectiveFrom)}</dt>
                  <dd>{formatMoney(r.weeklyCents)} / week</dd>
                </div>
              ))}
            </dl>
          </section>

          {!active && (
            <section className="panel stack">
              <h2>Bond settlement</h2>
              {rental.returnReason && <p className="small">Reason: {rental.returnReason}</p>}
              {deductions.length === 0 ? (
                <p className="muted small">No deductions; the bond was refunded in full.</p>
              ) : (
                <dl className="dl">
                  {deductions.map((d) => (
                    <div key={d.id} className="contents">
                      <dt>{deductionKindLabel[d.kind]}</dt>
                      <dd>{formatMoney(d.amountCents)} <span className="muted small">{d.description}</span></dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="small">Bond kept {formatMoney(rental.bondAppliedCents)}</p>
            </section>
          )}

          <section className="panel stack">
            <h2>Details</h2>
            <dl className="dl">
              <dt>Bond agreed</dt><dd>{formatMoney(rental.bondCents)}</dd>
              <dt>Notes</dt><dd>{rental.notes ?? '—'}</dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}

function PaymentForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const { rental, today } = Route.useLoaderData()
  const record = useServerFn(recordRentPayment)
  const suggested = rental.status === 'active' ? rental.weeklyCents : Math.max(rental.owedCents, 0)
  const { form, formError, onSubmit } = useSchemaForm({
    schema: rentPaymentInputSchema,
    defaultValues: { paidOn: today, amount: centsToInput(suggested || null), method: '', notes: '' },
    submit: (values) => record({ data: { id: rental.id, values } }),
    onSuccess: onDone,
  })
  return (
    <form className="form form-grid" onSubmit={onSubmit} noValidate>
      <form.AppField name="paidOn">{(f) => <f.TextField label="Date" type="date" required />}</form.AppField>
      <form.AppField name="amount">
        {(f) => <f.TextField label="Amount ($)" type="number" inputMode="decimal" min={0} step="0.01" required />}
      </form.AppField>
      <form.AppField name="method">{(f) => <f.SelectField label="Method" options={methodOptions} emptyLabel="—" />}</form.AppField>
      <form.AppField name="notes">{(f) => <f.TextField label="Notes" hint="optional" />}</form.AppField>
      <div className="span-all stack tight">
        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Record payment" /></form.AppForm>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  )
}

function RentChangeForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const { rental, today } = Route.useLoaderData()
  const adjust = useServerFn(adjustRent)
  const { form, formError, onSubmit } = useSchemaForm({
    schema: rentChangeInputSchema,
    defaultValues: { effectiveFrom: rental.nextDueOn ?? today, weeklyRent: centsToInput(rental.weeklyCents) },
    submit: (values) => adjust({ data: { id: rental.id, values } }),
    onSuccess: onDone,
  })
  return (
    <form className="form form-grid" onSubmit={onSubmit} noValidate>
      <form.AppField name="effectiveFrom">{(f) => <f.TextField label="From" type="date" required />}</form.AppField>
      <form.AppField name="weeklyRent">
        {(f) => <f.TextField label="New weekly rent ($)" type="number" inputMode="decimal" min={0} step="0.01" required />}
      </form.AppField>
      <div className="span-all stack tight">
        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Change rent" /></form.AppForm>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  )
}
