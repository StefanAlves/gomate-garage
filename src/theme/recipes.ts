import { defineRecipe } from '@pandacss/dev'

// Config recipes: Panda only emits CSS for variants that are actually used.
// Import them in components via `styled-system/recipes`.

const focusRing = {
  outline: '2px solid',
  outlineColor: 'ring',
  outlineOffset: '2px',
} as const

// GoMate CTA: red pill with a soft red shadow; outline pill as secondary.
export const button = defineRecipe({
  className: 'ui-button',
  jsx: ['Button'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2',
    fontFamily: 'sans',
    fontWeight: 'semibold',
    lineHeight: '1.5',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 'full',
    cursor: 'pointer',
    outline: 'none',
    transition: 'background 150ms, transform 150ms',
    _focusVisible: focusRing,
    _pressed: { transform: 'scale(0.97)' },
    _disabled: { opacity: 0.45, cursor: 'not-allowed', transform: 'none' },
  },
  variants: {
    variant: {
      solid: {
        bg: 'primary',
        color: 'primary.foreground',
        boxShadow: 'cta',
        _hovered: { bg: 'primary.hover' },
      },
      outline: {
        bg: 'transparent',
        color: 'foreground',
        borderColor: 'border',
        _hovered: { bg: 'accent' },
      },
      ghost: {
        bg: 'transparent',
        color: 'foreground',
        _hovered: { bg: 'secondary' },
      },
    },
    size: {
      sm: { px: '4', py: '2', fontSize: 'sm' },
      md: { px: '6', py: '3', fontSize: 'md' },
      lg: { px: '8', py: '4', fontSize: 'md', gap: '2.5' },
    },
  },
  defaultVariants: { variant: 'solid', size: 'md' },
})

export const link = defineRecipe({
  className: 'ui-link',
  jsx: ['Link'],
  base: {
    color: 'foreground',
    textDecoration: 'none',
    cursor: 'pointer',
    outline: 'none',
    borderRadius: 'sm',
    transition: 'color 150ms',
    _hovered: { color: 'primary' },
    _focusVisible: focusRing,
    _current: { color: 'primary', fontWeight: 'semibold' },
    _disabled: { opacity: 0.45, cursor: 'default' },
  },
})

// go-mate .gm-bar: the signature short red underline under headlines.
export const accentBar = defineRecipe({
  className: 'ui-accent-bar',
  base: {
    display: 'block',
    width: '40px',
    height: '4px',
    bg: 'primary',
    border: '0',
  },
})
