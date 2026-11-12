import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { defaultFinanceSaleInputSchema, financePaymentInputSchema, idSchema, type PaymentMethod } from '~/lib/schemas'
import { centsToInput, formatDate, formatMoney, labelOptions, methodLabel } from '~/lib/format'
import {
  defaultFinanceSale, getFinanceSale, payoffFinanceSale, recordFinancePayment, updateFinanceNotes,
} from '~/server/finance.functions'
import { ArrearsCell, FinanceStatusBadge } from '~/components/finance-table'
import { FieldShell, FormError, useSchemaForm } from '~/components/form'

export const Route = createFileRoute('/finance-sales/$saleId')({
  loader: ({ params }) => {
    const parsed = idSchema.safeParse({ id: params.saleId })
    if (!parsed.success) throw notFound()
    return getFinanceSale({ data: parsed.data })
  },
  head: ({ loaderData }) => ({ meta: [{ title: `Finance sale · ${loaderData?.sale.carPlate ?? ''} · Garage` }] }),
  component: FinanceSalePage,
})

type Panel = 'payment' | 'payoff' | 'default' | null
const methodOptions = labelOptions(methodLabel)
const instalmentLabel = { paid: 'Paid', part_paid: 'Part paid', overdue: 'Overdue', upcoming: 'Upcoming' } as const

function FinanceSalePage() {
  const { sale, schedule, payments } = Route.useLoaderData()
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<string>()
  const active = sale.status === 'active'

  const done = async (message: string) => {
    setPanel(null)
    setNotice(message)
    await router.invalidate()
  }

  const tiles = [
    ['Price', formatMoney(sale.priceCents)],
    ['Paid', formatMoney(sale.paidCents)],
    ['Balance', formatMoney(sale.balanceCents)],
    ['Arrears', <ArrearsCell key="arrears" sale={sale} />],
    ['Next due', sale.nextDueOn ? formatDate(sale.nextDueOn) : '—'],
  ] as const

  return (
    <div className="stack">
      <Link to="/fleet/sales" className="muted small">← Finance sales</Link>
      <header className="stack tight">
        <div className="row wrap">
          <h1>Finance sale · {sale.carName}</h1>
          <span className="plate">{sale.carPlate}</span>
          <FinanceStatusBadge status={sale.status} />
        </div>
        <p className="muted small">
          <Link to="/customers/$customerId" params={{ customerId: String(sale.customerId) }} search={{ tab: 'finance' }}>
            {sale.customerName}
          </Link>{' '}
          · {sale.customerPhone} · agreed {formatDate(sale.agreedOn)}
          {sale.closedOn && <> · {sale.status === 'completed' ? 'completed' : 'defaulted'} {formatDate(sale.closedOn)}</>} ·{' '}
          <Link to="/cars/$carId" params={{ carId: String(sale.carId) }} search={{ tab: 'finance' }}>view car</Link>
        </p>
        <p className="small">
          {sale.instalmentCount === 0
            ? 'Cash sale.'
            : `Deposit ${formatMoney(sale.depositCents)}, ${sale.instalmentCount} weekly instalments of ${formatMoney(sale.instalmentCents)}${
              sale.lastInstalmentCents !== sale.instalmentCents ? ` (last ${formatMoney(sale.lastInstalmentCents)})` : ''}.`}
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
      {sale.status === 'defaulted' && sale.defaultReason && <p className="notice error">Defaulted: {sale.defaultReason}</p>}

      {active && (
        <div className="row wrap">
          <button type="button" onClick={() => setPanel('payment')}>Record payment</button>
          <button type="button" className="ghost" onClick={() => setPanel('payoff')}>Payoff {formatMoney(sale.balanceCents)}</button>
          <button type="button" className="ghost danger" onClick={() => setPanel('default')}>Default…</button>
        </div>
      )}

      {panel === 'payment' && (
        <section className="panel stack">
          <h2>Record payment</h2>
          <PaymentForm onDone={(completed) => done(completed ? 'Paid in full. The car is now Sold.' : 'Payment recorded.')} onCancel={() => setPanel(null)} />
        </section>
      )}
      {panel === 'payoff' && (
        <section className="panel stack">
          <h2>Pay off the balance</h2>
          <PayoffForm onDone={() => done('Paid off. The car is now Sold.')} onCancel={() => setPanel(null)} />
        </section>
      )}
      {panel === 'default' && (
        <section className="panel stack">
          <h2>Default this finance sale</h2>
          <p className="small">
            The sale ends, the car goes back to Preparation, and the garage keeps the {formatMoney(sale.paidCents)} already paid.
            This can't be undone.
          </p>
          <DefaultForm onDone={() => done('Finance sale defaulted. The car is back in Preparation.')} onCancel={() => setPanel(null)} />
        </section>
      )}

      <div className="two-col wide-left">
        <section className="panel stack">
          <h2>Schedule</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th></tr>
              </thead>
              <tbody>
                {schedule.map((r) => (
                  <tr key={r.number}>
                    <td>{r.number === 0 ? 'Deposit' : r.number}</td>
                    <td>{formatDate(r.dueOn)}</td>
                    <td className="num">{formatMoney(r.amountCents)}</td>
                    <td className="num">{r.paidCents ? formatMoney(r.paidCents) : '—'}</td>
                    <td><span className={`badge inst-${r.state}`}>{instalmentLabel[r.state]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Due to date {formatMoney(sale.dueToDateCents)} · paid {formatMoney(sale.paidCents)}</p>
        </section>

        <div className="stack">
          <section className="panel stack">
            <h2>Payments</h2>
            {payments.length === 0 ? (
              <p className="muted">No payments recorded yet.</p>
            ) : (
              <dl className="dl">
                {payments.map((p) => (
                  <div key={p.id} className="contents">
                    <dt>{formatDate(p.occurredOn)}</dt>
                    <dd>
                      {formatMoney(p.amountCents)}{p.method && <span className="muted small"> · {methodLabel[p.method]}</span>}
                      {p.notes && <span className="muted small"> · {p.notes}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <NotesPanel />
        </div>
      </div>
    </div>
  )
}

function PaymentForm({ onDone, onCancel }: { onDone: (completed: boolean) => Promise<void>; onCancel: () => void }) {
  const { sale, today } = Route.useLoaderData()
  const record = useServerFn(recordFinancePayment)
  const suggested = Math.min(sale.instalmentCents || sale.balanceCents, sale.balanceCents)
  const { form, formError, onSubmit } = useSchemaForm({
    schema: financePaymentInputSchema,
    defaultValues: { paidOn: today, amount: centsToInput(suggested), method: '', notes: '' },
    submit: (values) => record({ data: { id: sale.id, values } }),
    onSuccess: ({ completed }) => onDone(completed),
  })
  return (
    <form className="form form-grid" onSubmit={onSubmit} noValidate>
      <form.AppField name="paidOn">{(f) => <f.TextField label="Date" type="date" required />}</form.AppField>
      <form.AppField name="amount">
        {(f) => <f.TextField label="Amount ($)" hint={`max ${formatMoney(sale.balanceCents)}`} type="number" inputMode="decimal" min={0} step="0.01" required />}
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

function PayoffForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const { sale, today } = Route.useLoaderData()
  const pay = useServerFn(payoffFinanceSale)
  const [paidOn, setPaidOn] = useState(today)
  const [method, setMethod] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  return (
    <div className="form stack">
      <div className="form-grid">
        <FieldShell label="Date"><input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></FieldShell>
        <FieldShell label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">—</option>
            {methodOptions.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </FieldShell>
      </div>
      <FormError error={error} />
      <div className="row">
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true)
          setError(undefined)
          try {
            const res = await pay({ data: { id: sale.id, paidOn, method: (method || null) as PaymentMethod | null } })
            if (res.ok) await onDone()
            else setError(Object.values(res.errors)[0])
          } finally {
            setBusy(false)
          }
        }}>
          {busy ? 'Saving…' : `Record payoff of ${formatMoney(sale.balanceCents)}`}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function DefaultForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const { sale, today } = Route.useLoaderData()
  const markDefault = useServerFn(defaultFinanceSale)
  const { form, formError, onSubmit } = useSchemaForm({
    schema: defaultFinanceSaleInputSchema,
    defaultValues: { defaultedOn: today, reason: '' },
    submit: (values) => markDefault({ data: { id: sale.id, values } }),
    onSuccess: onDone,
  })
  return (
    <form className="form form-grid" onSubmit={onSubmit} noValidate>
      <form.AppField name="defaultedOn">{(f) => <f.TextField label="Date" type="date" required />}</form.AppField>
      <form.AppField name="reason">{(f) => <f.TextField label="Reason" required placeholder="e.g. No payments for 6 weeks" />}</form.AppField>
      <div className="span-all stack tight">
        <FormError error={formError} />
        <div className="row">
          <form.AppForm><form.SubmitButton label="Confirm default" /></form.AppForm>
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  )
}

function NotesPanel() {
  const { sale } = Route.useLoaderData()
  const router = useRouter()
  const save = useServerFn(updateFinanceNotes)
  const [notes, setNotes] = useState(sale.notes ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  return (
    <section className="panel stack">
      <h2>Notes</h2>
      <textarea rows={4} value={notes} onChange={(e) => { setNotes(e.target.value); setState('idle') }} maxLength={2000} />
      <div className="row">
        <button type="button" className="ghost" disabled={state === 'saving' || notes === (sale.notes ?? '')} onClick={async () => {
          setState('saving')
          await save({ data: { id: sale.id, notes } })
          await router.invalidate()
          setState('saved')
        }}>
          {state === 'saving' ? 'Saving…' : 'Save notes'}
        </button>
        {state === 'saved' && <span className="muted small">Saved.</span>}
      </div>
    </section>
  )
}
