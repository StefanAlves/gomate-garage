import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { db } from './db.server'
import type { DocumentKind } from '~/lib/schemas'

// Photos of customers' ID documents. Files live outside public/ and are only
// served through the /api/documents/$documentId route, never as static files.

const dir = resolve(process.env.UPLOADS_PATH ?? 'data/uploads', 'customer-documents')
mkdirSync(dir, { recursive: true })

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
  return db
    .prepare(`SELECT ${columns} FROM customer_documents WHERE customer_id = ? ORDER BY kind`)
    .all(customerId) as unknown as CustomerDocument[]
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

  const fileName = `${randomUUID()}.${type.ext}`
  await writeFile(join(dir, fileName), bytes, { flag: 'wx', mode: 0o600 })

  const previous = db
    .prepare('SELECT file_name AS fileName FROM customer_documents WHERE customer_id = ? AND kind = ?')
    .get(customerId, kind) as { fileName: string } | undefined
  try {
    db.exec('BEGIN')
    db.prepare('DELETE FROM customer_documents WHERE customer_id = ? AND kind = ?').run(customerId, kind)
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO customer_documents (customer_id, kind, file_name, mime_type, size_bytes, original_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(customerId, kind, fileName, type.mime, bytes.length, file.name.slice(0, 200) || null)
    db.exec('COMMIT')
    if (previous) await removeFile(previous.fileName)
    return Number(lastInsertRowid)
  } catch (err) {
    db.exec('ROLLBACK')
    await removeFile(fileName)
    throw err
  }
}

export async function deleteDocument(id: number) {
  const row = db
    .prepare('DELETE FROM customer_documents WHERE id = ? RETURNING file_name AS fileName')
    .get(id) as { fileName: string } | undefined
  if (row) await removeFile(row.fileName)
  return !!row
}

/** File names for a customer, read before the customer is deleted (rows cascade, files don't). */
export function documentFilesForCustomer(customerId: number) {
  return (db.prepare('SELECT file_name AS fileName FROM customer_documents WHERE customer_id = ?').all(customerId) as {
    fileName: string
  }[]).map((r) => r.fileName)
}

export async function readDocument(id: number) {
  const row = db
    .prepare('SELECT file_name AS fileName, mime_type AS mimeType FROM customer_documents WHERE id = ?')
    .get(id) as { fileName: string; mimeType: string } | undefined
  if (!row) return null
  try {
    return { body: await readFile(join(dir, row.fileName)), mimeType: row.mimeType }
  } catch {
    return null
  }
}

export async function removeFile(fileName: string) {
  await unlink(join(dir, fileName)).catch(() => {})
}
