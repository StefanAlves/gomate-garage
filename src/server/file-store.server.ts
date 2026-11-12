import '@tanstack/react-start/server-only'
import { mkdirSync } from 'node:fs'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { del, get, put } from '@vercel/blob'

// Where private files (customer ID photos) live. On Vercel there's no lasting
// disk, so they go to a private Vercel Blob store; reads need the store's
// credentials, and the app serves them itself. Locally they stay in a folder.

export interface FileStore {
  put(name: string, bytes: Uint8Array, contentType: string): Promise<void>
  /** The file's bytes, or null when it isn't there. */
  get(name: string): Promise<Uint8Array | null>
  remove(name: string): Promise<void>
}

function folderStore(root: string): FileStore {
  const dir = resolve(root)
  mkdirSync(dir, { recursive: true })
  return {
    // 'wx': never overwrite; names are random UUIDs.
    put: (name, bytes) => writeFile(join(dir, name), bytes, { flag: 'wx', mode: 0o600 }),
    get: (name) => readFile(join(dir, name)).then((b) => new Uint8Array(b), () => null),
    remove: (name) => unlink(join(dir, name)).catch(() => {}),
  }
}

function blobStore(prefix: string): FileStore {
  const path = (name: string) => `${prefix}/${name}`
  return {
    async put(name, bytes, contentType) {
      await put(path(name), Buffer.from(bytes), { access: 'private', contentType, addRandomSuffix: false })
    },
    async get(name) {
      const found = await get(path(name), { access: 'private', useCache: false })
      if (!found || found.statusCode !== 200) return null
      return new Uint8Array(await new Response(found.stream).arrayBuffer())
    },
    remove: (name) => del(path(name)).catch(() => {}),
  }
}

const useBlob = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)

/** Customer ID photos. */
export const documentStore: FileStore = useBlob
  ? blobStore('customer-documents')
  : folderStore(join(process.env.UPLOADS_PATH ?? 'data/uploads', 'customer-documents'))
