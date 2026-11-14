import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary, NotFound, PendingBlock } from './components/boundaries'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    // SPA navigation: keep the current page on screen (with the top progress
    // bar) while the next one loads. The skeleton only shows on a slow first
    // load; list routes never show it, so a filter change never blanks the page.
    // Visited pages stay cached and show instantly, refreshing in the background.
    defaultPendingMs: 1000,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    defaultPendingComponent: PendingBlock,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
