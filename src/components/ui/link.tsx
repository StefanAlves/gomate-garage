import { createLink, type LinkComponent } from '@tanstack/react-router'
import { Link as AriaLink, type LinkProps as AriaLinkProps } from 'react-aria-components/Link'
import { cx } from 'styled-system/css'
import { link } from 'styled-system/recipes'

/**
 * React Aria <Link> driven by TanStack Router: typed `to`/`params`/`search`,
 * client-side navigation and intent preloading, plus React Aria's press,
 * hover and focus-visible handling (exposed as data-* attributes).
 */
function AriaLinkComponent({ className, disabled, ...props }: AriaLinkProps & { disabled?: boolean }) {
  return (
    <AriaLink
      {...props}
      // The router passes `disabled` (e.g. a pager link with no next page).
      isDisabled={disabled || props.isDisabled}
      className={
        typeof className === 'function'
          ? (state) => cx(link(), className(state))
          : cx(link(), className)
      }
    />
  )
}

const RouterAriaLink = createLink(AriaLinkComponent)

export const Link: LinkComponent<typeof AriaLinkComponent> = (props) => (
  <RouterAriaLink preload="intent" {...props} />
)
