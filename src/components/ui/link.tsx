import { createLink, type LinkComponent } from '@tanstack/react-router'
import { Link as AriaLink, type LinkProps as AriaLinkProps } from 'react-aria-components/Link'
import { cx } from 'styled-system/css'
import { button, link, type ButtonVariantProps } from 'styled-system/recipes'

type LinkProps = AriaLinkProps & ButtonVariantProps & { disabled?: boolean }

/**
 * React Aria <Link> driven by TanStack Router: typed `to`/`params`/`search`,
 * client-side navigation and intent preloading, plus React Aria's press,
 * hover and focus-visible handling (exposed as data-* attributes).
 *
 * Pass `variant` (and optionally `size`) to style it as a button, e.g. a
 * "New car" link that navigates but looks like the primary CTA.
 */
function AriaLinkComponent({ className, disabled, variant, size, ...props }: LinkProps) {
  const recipeClass = variant ? button({ variant, size }) : link()
  return (
    <AriaLink
      {...props}
      // The router passes `disabled` (e.g. a pager link with no next page).
      isDisabled={disabled || props.isDisabled}
      className={
        typeof className === 'function'
          ? (state) => cx(recipeClass, className(state))
          : cx(recipeClass, className)
      }
    />
  )
}

const RouterAriaLink = createLink(AriaLinkComponent)

export const Link: LinkComponent<typeof AriaLinkComponent> = (props) => (
  <RouterAriaLink preload="intent" {...props} />
)
