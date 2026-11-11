import { createStart } from '@tanstack/react-start'

// App-wide Start config. Every route is fully server-rendered unless it opts
// out with its own `ssr` option (see /dashboard and /settings).
export const startInstance = createStart(() => ({
  defaultSsr: true,
}))
