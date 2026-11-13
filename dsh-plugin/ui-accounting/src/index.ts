/**
 * MicroBalance accounting pages, node half.
 *
 * Pure UI plugin: the empty apply gives the Loader a host-side row while the
 * browser half ships through exports["./client"], discovered through the
 * package.json dsh.client declaration.
 */

/** Host plugin body — all behavior lives in the browser half. */
export function apply(): void {}
