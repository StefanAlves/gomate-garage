import { useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { returnRentalInputSchema, fieldErrors, type MANUAL_DEDUCTION_KINDS } from '~/lib/schemas'
import { deductionKindLabel, formatDate, formatMoney, labelOptions, methodLabel } from '~/lib/format'
import { settle } from '~/lib/rent'
import { getSettlementPreview, returnRental } from '~/server/rentals.functions'
import type { SettlementPreview } from '~/server/rentals.server'
import { FieldShell, FormError } from './form'

type Extra = { kind: (typeof MANUAL_DEDUCTION_KINDS)[number]; description: string; amount: string }
const methodOptions = labelOptions(methodLabel)

/**
 * Return a Rental and settle the Bond: pick the return date, review the
 * suggested deductions (Arrears, fines and tolls from the rental period), add
 * damage, see the refund or shortfall, then confirm.
 */
export function ReturnRental({ rentalId, today, onDone, onCancel }: {
  rentalId: number
  today: string
  onDone: () => void | Promise<void>
  onCancel: () => void
}) {
  const fetchPreview = useServerFn(getSettlementPreview)
  const submit = useServerFn(returnRental)
  const [returnedOn, setReturnedOn] = useState(today)
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<SettlementPreview>()
  const [chargeIds, setChargeIds] = useState<Set<number>>(new Set())
  const [extras, setExtras] = useState<Extra[]>([])
  const [refundMethod, setRefundMethod] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(returnedOn)) return
    let current = true
    fetchPreview({ data: { id: rentalId, returnedOn } }).then(
      (p) => {
        if (!current || typeof p === 'string') return
        setPreview(p)
        setChargeIds(new Set(p.charges.map((c) => c.id)))
      },
      (err: unknown) => current && setError(err instanceof Error ? err.message : 'Could not load the settlement'),
    )
    return () => { current = false }
  }, [rentalId, returnedOn]) // eslint-disable-line react-hooks/exhaustive-deps

  const chosenCharges = preview?.charges.filter((c) => chargeIds.has(c.id)) ?? []
  const extrasCents = extras.reduce((sum, e) => sum + Math.round((Number(e.amount) || 0) * 100), 0)
  const deductionsCents = (preview?.rentArrearsCents ?? 0) + chosenCharges.reduce((s, c) => s + c.amountCents, 0) + extrasCents
  const outcome = settle(preview?.bondHeldCents ?? 0, deductionsCents)

  const setExtra = (i: number, patch: Partial<Extra>) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  async function confirm() {
    setError(undefined)
    const parsed = returnRentalInputSchema.safeParse({
      returnedOn, reason, chargeIds: [...chargeIds], extras, refundMethod,
    })
    if (!parsed.success) {
      setError(Object.values(fieldErrors(parsed.error))[0])
      return
    }
    setBusy(true)
    try {
      const res = await submit({ data: { id: rentalId, values: parsed.data } })
      if (res.ok) await onDone()
      else setError(Object.values(res.errors)[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form stack">
      <div className="form-grid">
        <FieldShell label="Return date">
          <input type="date" value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} required />
        </FieldShell>
        <FieldShell label="Reason" hint="optional, e.g. stopped paying">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </FieldShell>
      </div>

      <h3>Deductions from the bond</h3>
      {!preview ? (
        <p className="muted">Working out the settlement…</p>
      ) : (
        <div className="stack tight">
          <p>
            Rent arrears to {formatDate(preview.returnedOn)}: <strong>{formatMoney(preview.rentArrearsCents)}</strong>
            {preview.rentArrearsCents === 0 && <span className="muted small"> (rent is up to date)</span>}
          </p>
          {preview.charges.length === 0 ? (
            <p className="muted small">No unpaid fines or tolls on this car during the rental.</p>
          ) : (
            preview.charges.map((c) => (
              <label key={c.id} className="check">
                <input
                  type="checkbox"
                  checked={chargeIds.has(c.id)}
                  onChange={(e) =>
                    setChargeIds((s) => {
                      const next = new Set(s)
                      if (e.target.checked) next.add(c.id)
                      else next.delete(c.id)
                      return next
                    })
                  }
                />
                <span>
                  {deductionKindLabel[c.kind]} · {formatDate(c.incurredOn)}{c.description && ` · ${c.description}`} ·{' '}
                  <strong>{formatMoney(c.amountCents)}</strong>
                </span>
              </label>
            ))
          )}

          {extras.map((x, i) => (
            <div key={i} className="deduction-row">
              <FieldShell label="Kind">
                <select value={x.kind} onChange={(e) => setExtra(i, { kind: e.target.value as Extra['kind'] })}>
                  <option value="damage">Damage</option>
                  <option value="other">Other</option>
                </select>
              </FieldShell>
              <FieldShell label="Description">
                <input value={x.description} onChange={(e) => setExtra(i, { description: e.target.value })} maxLength={200} />
              </FieldShell>
              <FieldShell label="Amount ($)">
                <input type="number" inputMode="decimal" min={0} step="0.01" value={x.amount}
                  onChange={(e) => setExtra(i, { amount: e.target.value })} />
              </FieldShell>
              <button type="button" className="ghost danger" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="ghost" onClick={() => setExtras((xs) => [...xs, { kind: 'damage', description: '', amount: '' }])}>
              + Add damage or other deduction
            </button>
          </div>

          <h3>Settlement</h3>
          <div className="settlement">
            <span>Bond held</span><span className="num">{formatMoney(preview.bondHeldCents)}</span>
            <span>Deductions</span><span className="num">−{formatMoney(deductionsCents)}</span>
            {outcome.shortfallCents > 0 ? (
              <>
                <span className="total urgent">Customer still owes</span>
                <span className="total num urgent">{formatMoney(outcome.shortfallCents)}</span>
              </>
            ) : (
              <>
                <span className="total">Refund to customer</span>
                <span className="total num positive">{formatMoney(outcome.refundCents)}</span>
              </>
            )}
          </div>
          {outcome.refundCents > 0 && (
            <div className="form-grid">
              <FieldShell label="Refund paid by">
                <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                  <option value="">—</option>
                  {methodOptions.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </FieldShell>
            </div>
          )}
          {outcome.shortfallCents > 0 && (
            <p className="muted small">The shortfall stays on this rental until it's paid; record payments here after the return.</p>
          )}
        </div>
      )}

      <FormError error={error} />
      <div className="row">
        <button type="button" onClick={confirm} disabled={!preview || busy}>
          {busy ? 'Returning…' : 'Confirm return'}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
      <p className="muted small">The car goes back to Preparation, and the fines and tolls ticked above are marked paid by the customer.</p>
    </div>
  )
}
