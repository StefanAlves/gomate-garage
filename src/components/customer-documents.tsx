import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { DOCUMENT_KINDS, DOCUMENT_MIME_TYPES, documentUploadSchema, type DocumentKind } from '~/lib/schemas'
import { documentKindLabel, formatDate } from '~/lib/format'
import { deleteCustomerDocument, uploadCustomerDocument } from '~/server/garage.functions'
import type { CustomerDocument } from '~/server/documents.server'
import { DeleteButton } from './form'

const accept = DOCUMENT_MIME_TYPES.join(',')

/** Photo slots for a customer's ID documents. Each slot uploads as soon as a photo is picked. */
export function CustomerDocuments({ customerId, documents }: { customerId: number; documents: CustomerDocument[] }) {
  return (
    <section className="panel stack" aria-labelledby="documents-title">
      <div>
        <h2 id="documents-title">ID documents</h2>
        <p className="muted small">Photos of the driver's licence (front and back) or passport. JPEG, PNG or WebP, up to 10 MB.</p>
      </div>
      <div className="doc-grid">
        {DOCUMENT_KINDS.map((kind) => (
          <DocumentSlot key={kind} customerId={customerId} kind={kind} doc={documents.find((d) => d.kind === kind)} />
        ))}
      </div>
    </section>
  )
}

function DocumentSlot({ customerId, kind, doc }: { customerId: number; kind: DocumentKind; doc?: CustomerDocument }) {
  const router = useRouter()
  const upload = useServerFn(uploadCustomerDocument)
  const remove = useServerFn(deleteCustomerDocument)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const inputId = `doc-${kind}`

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // so picking the same file again still fires change
    if (!file) return
    const checked = documentUploadSchema.safeParse({ customerId, kind, file })
    if (!checked.success) return setError(checked.error.issues[0]?.message)
    setError(undefined)
    setBusy(true)
    try {
      const body = new FormData()
      body.set('customerId', String(customerId))
      body.set('kind', kind)
      body.set('file', file)
      const res = await upload({ data: body })
      if (!res.ok) setError(Object.values(res.errors)[0])
      else await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  // Version in the URL: a replaced photo can get the same id, and the <img> must still reload.
  const src = doc ? `/api/documents/${doc.id}?v=${encodeURIComponent(doc.createdAt)}` : undefined
  return (
    <figure className="doc-slot">
      <figcaption className="strong small">{documentKindLabel[kind]}</figcaption>
      {doc ? (
        <a href={src} target="_blank" rel="noreferrer" className="doc-preview" aria-label={`Open ${documentKindLabel[kind]} photo`}>
          <img src={src} alt={documentKindLabel[kind]} loading="lazy" />
        </a>
      ) : (
        <label htmlFor={inputId} className="doc-preview doc-empty" aria-disabled={busy}>
          {busy ? 'Uploading…' : '+ Add photo'}
        </label>
      )}
      <input id={inputId} type="file" accept={accept} hidden onChange={onPick} disabled={busy} />
      {doc && (
        <div className="row wrap between">
          <span className="muted small">Added {formatDate(doc.createdAt)}</span>
          <span className="row tight">
            <label htmlFor={inputId} className="button ghost" aria-disabled={busy}>
              {busy ? 'Uploading…' : 'Replace'}
            </label>
            <DeleteButton label="Remove" onConfirm={async () => {
              await remove({ data: { id: doc.id } })
              await router.invalidate()
            }} />
          </span>
        </div>
      )}
      {error && <p className="urgent small" role="alert">{error}</p>}
    </figure>
  )
}
