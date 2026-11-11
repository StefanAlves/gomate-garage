import { ErrorComponent, Link, rootRouteId, useMatch, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({ strict: false, select: (m) => m.id === rootRouteId })
  return (
    <div className="panel error">
      <h2>Something went wrong</h2>
      <ErrorComponent error={error} />
      <div className="row">
        <button onClick={() => router.invalidate()}>Try again</button>
        {isRoot ? <Link to="/">Home</Link> : <button onClick={() => window.history.back()}>Go back</button>}
      </div>
    </div>
  )
}

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="panel">
      <h2>Not found</h2>
      <p className="muted">{children ?? 'The page you are looking for does not exist.'}</p>
      <Link to="/">Back home</Link>
    </div>
  )
}

export function PendingBlock() {
  return (
    <div className="panel" aria-busy="true">
      <div className="skeleton" style={{ width: '40%' }} />
      <div className="skeleton" />
      <div className="skeleton" style={{ width: '70%' }} />
    </div>
  )
}
