/**
 * For the tests only: a binary fixture kept as base64 text (read with Vite's
 * `?raw`; vitest hands other imports over as paths), as bytes.
 */
export const bytesOf = (base64: string) => Uint8Array.from(atob(base64.replace(/\s+/g, '')), (c) => c.charCodeAt(0))
