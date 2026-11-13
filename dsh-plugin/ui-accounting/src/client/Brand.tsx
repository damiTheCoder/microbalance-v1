/** MicroBalance sidebar identity: the product logo and wordmark. */
import logoUrl from './assets/logo.png'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './brand.module.css'

/**
 * Render the MicroBalance logo in the expanded brand row and collapsed rail.
 * @param props - requested square edge in pixels.
 * @returns the product mark.
 */
export function MicroBalanceMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <img
      className={css.mark}
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}

/**
 * Render the MicroBalance wordmark beside the brand mark.
 * @returns the product name.
 */
export function MicroBalanceName() {
  return <span className={css.name}>Microbalance</span>
}
