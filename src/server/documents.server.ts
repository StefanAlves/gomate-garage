import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { db, inTransaction } from './db.server'
import { documentStore as store } from './file-store.server'
import type { DocumentKind } from '~/lib/schemas'

// Photos of customers' ID documents. Files live in a private store (see
// file-store.server.ts) and are only served through the
// /api/documents/$documentId route, never as static or public files.

export interface CustomerDocument {
  id: number
  customerId: number
  kind: DocumentKind
  mimeType: string
  sizeBytes: number
  originalName: string | null
  createdAt: string
}

const columns = `id, customer_id AS customerId, kind, mime_type AS mimeType, size_bytes AS sizeBytes,
  original_name AS originalName, created_at AS createdAt`

export function documentsForCustomer(customerId: number) {
  return db.all<CustomerDocument>(`SELECT ${columns} FROM customer_documents WHERE customer_id = ? ORDER BY kind`, [customerId])
}

/** The browser's MIME type is only a hint; trust the file's first bytes. */
function sniffImage(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' }
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

/**
 * Stores the photo for one slot, replacing any earlier photo in that slot.
 * Returns null when the bytes are not a JPEG, PNG or WebP image.
 */
export async function saveDocument(customerId: number, kind: DocumentKind, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImage(bytes)
  if (!type) return null

  // The file goes first: a row must never point at a missing file.
  const fileName = `${randomUUID()}.${type.ext}`
  await store.put(fileName, bytes, type.mime)

  try {
    const { id, previous } = await inTransaction(async () => {
      const previous = await db.get<{ fileName: string }>(
        'SELECT file_name AS fileName FROM customer_documents WHERE customer_id = ? AND kind = ?', [customerId, kind],
      )
      await db.run('DELETE FROM customer_documents WHERE customer_id = ? AND kind = ?', [customerId, kind])
      const { lastInsertRowid: id } = await db.run(
        `INSERT INTO customer_documents (customer_id, kind, file_name, mime_type, size_bytes, original_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customerId, kind, fileName, type.mime, bytes.length, file.name.slice(0, 200) || null],
      )
      return { id, previous }
    })
    if (previous) await removeFile(previous.fileName)
    return id
  } catch (err) {
    await removeFile(fileName)
    throw err
  }
}

export async function deleteDocument(id: number) {
  const row = await db.get<{ fileName: string }>(
    'DELETE FROM customer_documents WHERE id = ? RETURNING file_name AS fileName', [id],
  )
  if (row) await removeFile(row.fileName)
  return !!row
}

/** File names for a customer, read before the customer is deleted (rows cascade, files don't). */
export async function documentFilesForCustomer(customerId: number) {
  const rows = await db.all<{ fileName: string }>(
    'SELECT file_name AS fileName FROM customer_documents WHERE customer_id = ?', [customerId],
  )
  return rows.map((r) => r.fileName)
}

export async function readDocument(id: number) {
  const row = await db.get<{ fileName: string; mimeType: string }>(
    'SELECT file_name AS fileName, mime_type AS mimeType FROM customer_documents WHERE id = ?', [id],
  )
  if (!row) return null
  const body = await store.get(row.fileName)
  return body ? { body, mimeType: row.mimeType } : null
}

export async function removeFile(fileName: string) {
  await store.remove(fileName)
}
