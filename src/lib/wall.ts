import type { Affine, Box, FeaturesJson, Point } from './types'

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0]
const filled = new WeakMap<FeaturesJson, Affine[]>()

/** Per-frame wall transforms with unknown frames filled from the nearest known frame (identity when none). */
function transforms(f: FeaturesJson): Affine[] | null {
  const raw = f.wall_transform
  if (!raw || raw.length === 0) return null
  let out = filled.get(f)
  if (out) return out
  out = new Array<Affine>(raw.length)
  let last: Affine | null = null
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]) last = raw[i]
    out[i] = last as Affine
  }
  let next: Affine | null = null
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i]) next = raw[i]
    if (!out[i]) out[i] = next ?? IDENTITY
  }
  filled.set(f, out)
  return out
}

/** Transform from reference (frame 0) wall coordinates to frame `i`. */
export function wallAt(f: FeaturesJson, i: number): Affine {
  const t = transforms(f)
  if (!t) return IDENTITY
  return t[Math.max(0, Math.min(t.length - 1, i))]
}

export function apply([a, b, c, d, tx, ty]: Affine, [x, y]: Point): Point {
  return [a * x + b * y + tx, c * x + d * y + ty]
}

export function invert([a, b, c, d, tx, ty]: Affine): Affine {
  const det = a * d - b * c || 1
  const ia = d / det
  const ib = -b / det
  const ic = -c / det
  const id = a / det
  return [ia, ib, ic, id, -(ia * tx + ib * ty), -(ic * tx + id * ty)]
}

/** A point seen in frame `from`, re-projected into frame `to` (so a trail stays on the wall when the camera moves). */
export function reproject(f: FeaturesJson, p: Point, from: number, to: number): Point {
  if (!f.wall_transform || from === to) return p
  return apply(wallAt(f, to), apply(invert(wallAt(f, from)), p))
}

/** Path of a reference-coordinate box (grown by `pad` on each side) as it appears in frame `i`. */
export function boxPath(ctx: CanvasRenderingContext2D, T: Affine, b: Box, pad = 0) {
  const x0 = b.x - pad
  const y0 = b.y - pad
  const x1 = b.x + b.w + pad
  const y1 = b.y + b.h + pad
  const pts = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Point[]).map((p) => apply(T, p))
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1])
  ctx.closePath()
}
