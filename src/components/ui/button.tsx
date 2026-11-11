import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components/Button'
import { cx } from 'styled-system/css'
import { button, type ButtonVariantProps } from 'styled-system/recipes'

export type ButtonProps = AriaButtonProps & ButtonVariantProps

export function Button({ variant, size, className, ...props }: ButtonProps) {
  const recipeClass = button({ variant, size })
  return (
    <AriaButton
      {...props}
      className={
        typeof className === 'function'
          ? (state) => cx(recipeClass, className(state))
          : cx(recipeClass, className)
      }
    />
  )
}
