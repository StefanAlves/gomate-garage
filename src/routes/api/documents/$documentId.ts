import { createFileRoute } from '@tanstack/react-router'
import { readDocument } from '~/server/documents.server'

// Serves one ID-document photo. Private: never cached by shared caches, and
// served with a sniff-proof content type.
export const Route = createFileRoute('/api/documents/$documentId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = Number(params.documentId)
        const doc = Number.isInteger(id) && id > 0 ? await readDocument(id) : null
        if (!doc) return new Response('Not found', { status: 404 })
        return new Response(new Uint8Array(doc.body), {
          headers: {
            'Content-Type': doc.mimeType,
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})
