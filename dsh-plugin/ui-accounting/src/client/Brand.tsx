/** MicroBalance sidebar identity: the product logo and wordmark. */
import logoUrl from './assets/logo.png'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './brand.module.css'
import { CORE_URL } from './core.ts'

const openLanding = (event: { preventDefault: () => void; stopPropagation: () => void }): void => {
  event.preventDefault()
  event.stopPropagation()
  window.location.assign(`${CORE_URL}/?home=1`)
}

/** Capture the press before the surrounding New-Session button sees it. */
const pressLanding = (event: { preventDefault: () => void; stopPropagation: () => void }): void => {
  event.stopPropagation()
  window.location.assign(`${CORE_URL}/?home=1`)
}

/**
 * Render the MicroBalance logo in the expanded brand row and collapsed rail.
 * @param props - requested square edge in pixels.
 * @returns the product mark.
 */
export function MicroBalanceMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <img
      className={`${css.mark} ${css.clickable}`}
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      onPointerDown={pressLanding}
      onClick={openLanding}
    />
  )
}

/**
 * Render the MicroBalance wordmark beside the brand mark.
 * @returns the product name.
 */
export function MicroBalanceName() {
  return (
    <span
      className={`${css.name} ${css.clickable}`}
      role="link"
      tabIndex={0}
      onPointerDown={pressLanding}
      onClick={openLanding}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openLanding(event)
      }}
    >
      Microbalance
    </span>
  )
}
