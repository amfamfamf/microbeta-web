const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** 32 chars from a 62-char alphabet (~190 bits). Rejection sampling avoids modulo bias. */
export function randomToken(length = 32): string {
  let out = ''
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const b of bytes) {
      if (b < 248 && out.length < length) out += ALPHABET[b % 62]
    }
  }
  return out
}
