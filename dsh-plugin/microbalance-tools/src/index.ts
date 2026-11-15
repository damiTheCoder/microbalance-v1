/**
 * DeepSeek Harness plugin entry for the MicroBalance accounting tools.
 *
 * Standard Cordis namespace plugin: the loader reads `name`, waits for the
 * injected services, then calls `apply(ctx)`. Every registration is attached
 * to the plugin's Cordis effect scope, so unloading the plugin removes both the
 * tools and the system-prompt section.
 *
 * @module @microbalance/dsh-tool-microbalance-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import {
  MICROBALANCE_PROMPT_ORDER,
  MICROBALANCE_PROMPT_SECTION,
  MICROBALANCE_PROMPT_TEXT,
} from './prompt.ts'
import { microbalanceTools } from './tools.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'microbalance-tools'

/**
 * `tools` provides the registry; `systemPrompt` provides the section registry.
 * Declaring both holds the plugin until the capability surfaces are ready.
 */
export const inject = ['tools', 'systemPrompt']

/**
 * Register every MicroBalance tool and the accounting guidance section.
 *
 * @param ctx - Cordis context with the injected services.
 */
export function apply(ctx: Context): void {
  for (const tool of microbalanceTools) {
    ctx.tools.register(tool)
  }

  ctx.systemPrompt.section({
    name: MICROBALANCE_PROMPT_SECTION,
    order: MICROBALANCE_PROMPT_ORDER,
    text: MICROBALANCE_PROMPT_TEXT,
    interpolate: false,
  })
}
