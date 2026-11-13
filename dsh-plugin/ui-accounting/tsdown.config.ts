import { clientBundle } from '../tsdown.client.ts'

/**
 * Recharts is a third-party runtime dependency. The preset's client face
 * bundles every specifier the browser module table does not provide, so it is
 * inlined into lib/client.js and needs no external entry.
 */
export default clientBundle(import.meta.dirname, ['lib/types/index.js'])
