import { LIMBS, type FeaturesJson, type LimbName, type Point, type ResultJson } from './types'

/**
 * Overlay colors from the Mono ice design system (DESIGN.md, tokens --ov-*).
 * They never change with the theme. Line style differs as well as color, for color-blind users.
 */
export const COLORS = {
  bone: '#FFFFFF', // --ov-skel
  joint: '#FFFFFF',
  outline: '#06283A', // --ov-outline
  cog: '#8EE3FF', // --ov-cog
  cogPath: '142,227,255',
  cogGlow: 'rgba(142,227,255,0.9)',
  plumb: 'rgba(142,227,255,0.95)',
  baseIn: '#FFFFFF', // solid bar: COG over the base
  baseOut: '#B2B2B2', // --ov-fall, dashed bar: COG outside the base
  reach: '#FFFFFF', // --ov-reach
  target: '#FFFFFF',
  tapped: '#8EE3FF',
  labelBg: 'rgba(6,40,58,0.8)',
  label: '#FFFFFF',
  font: 'Barlow, "Helvetica Neue", Arial, sans-serif',
}

const MIN_SCORE = 0.3
const EVENT_LABEL: Record<string, string> = {
  foot_cut: 'Foot cut',
  release: 'Release',
  catch: 'Catch',
  foot_place: 'Foot placed',
  deadpoint: 'Deadpoint',
  dyno: 'Dyno',
}

export function frameAt(time: number, f: FeaturesJson): number {
  const n = f.keypoints.length
  if (!n) return 0
  return Math.max(0, Math.min(n - 1, Math.round(time * f.fps)))
}

function hasContact(f: FeaturesJson, limb: LimbName, i: number): boolean {
  return Boolean(f.contacts[limb]?.[i])
}

/** Is frame `i` in the window around the fall where the reach vector is useful? */
function nearFall(r: ResultJson, f: FeaturesJson, i: number): boolean {
  if (!r.fall) return false
  const before = Math.round(f.fps * 1.0)
  const after = Math.round(f.fps * 0.3)
  return i >= r.fall.frame - before && i <= r.fall.drop_frame + after
}

/** The hand that is reaching: a hand that is off the wall, closest to the target. */
function reachingHand(f: FeaturesJson, target: Point, i: number): Point | null {
  let best: Point | null = null
  let bestD = Infinity
  let bestOff = false
  for (const limb of ['l_hand', 'r_hand'] as const) {
    const p = f.limbs[limb]?.[i]
    if (!p) continue
    const off = !hasContact(f, limb, i)
    const d = Math.hypot(p[0] - target[0], p[1] - target[1])
    // Prefer a hand that is off the wall; tie-break on distance.
    if ((off && !bestOff) || (off === bestOff && d < bestD)) {
      best = p
      bestD = d
      bestOff = off
    }
  }
  return best
}

function arrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, head: number) {
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0])
  ctx.beginPath()
  ctx.moveTo(from[0], from[1])
  ctx.lineTo(to[0], to[1])
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(to[0], to[1])
  ctx.lineTo(to[0] - head * Math.cos(ang - 0.45), to[1] - head * Math.sin(ang - 0.45))
  ctx.lineTo(to[0] - head * Math.cos(ang + 0.45), to[1] - head * Math.sin(ang + 0.45))
  ctx.closePath()
  ctx.fill()
}

/**
 * Draw the overlay for frame `i`. The context must already be scaled so that
 * one unit = one pixel of video.mp4 (the coordinate space of features.json).
 * `unit` = how many video pixels one CSS pixel covers, to keep lines a steady width on screen.
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  f: FeaturesJson,
  r: ResultJson,
  i: number,
  unit: number,
) {
  const lw = (px: number) => px * unit
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Base of support: span of the limbs that are on the wall, as a band at their height.
  const on: Point[] = []
  for (const limb of LIMBS) {
    const p = f.limbs[limb]?.[i]
    if (p && hasContact(f, limb, i)) on.push(p)
  }
  const cog = f.cog[i]
  if (on.length) {
    const pad = lw(10)
    const xs = on.map((p) => p[0])
    const ys = on.map((p) => p[1])
    const x0 = Math.min(...xs) - pad
    const x1 = Math.max(...xs) + pad
    const y1 = Math.max(...ys) + pad
    const inside = cog ? cog[0] >= x0 && cog[0] <= x1 : true
    // Bar under the lowest contact, with end caps. Solid = COG over the base, dashed grey = outside.
    const y = y1
    ctx.setLineDash(inside ? [] : [lw(6), lw(5)])
    ctx.strokeStyle = COLORS.outline
    ctx.lineWidth = lw(6)
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    ctx.strokeStyle = inside ? COLORS.baseIn : COLORS.baseOut
    ctx.lineWidth = lw(3.5)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(x0, y - lw(7))
    ctx.lineTo(x0, y + lw(7))
    ctx.moveTo(x1, y - lw(7))
    ctx.lineTo(x1, y + lw(7))
    ctx.stroke()
  }

  // Hold the user tapped (v1.1): solid outline just outside the hold box.
  const tappedId = r.holds?.tapped_id
  if (tappedId != null) {
    const h = r.holds?.holds.find((x) => x.id === tappedId)
    if (h) {
      ctx.strokeStyle = COLORS.tapped
      ctx.lineWidth = lw(2.5)
      ctx.strokeRect(h.x - lw(4), h.y - lw(4), h.w + lw(8), h.h + lw(8))
    }
  }

  // Target hold + reach vector near the fall.
  const t = r.target_hold
  if (t) {
    const near = nearFall(r, f, i)
    ctx.globalAlpha = near ? 1 : 0.5
    ctx.strokeStyle = COLORS.outline
    ctx.lineWidth = lw(6)
    ctx.strokeRect(t.x, t.y, t.w, t.h)
    ctx.strokeStyle = COLORS.target
    ctx.lineWidth = lw(3.5)
    ctx.strokeRect(t.x, t.y, t.w, t.h)
    ctx.globalAlpha = 1
    if (near) {
      const center: Point = [t.x + t.w / 2, t.y + t.h / 2]
      const hand = reachingHand(f, center, i)
      if (hand) {
        ctx.strokeStyle = COLORS.outline
        ctx.fillStyle = COLORS.outline
        ctx.lineWidth = lw(5.5)
        arrow(ctx, hand, center, lw(13))
        ctx.strokeStyle = COLORS.reach
        ctx.fillStyle = COLORS.reach
        ctx.lineWidth = lw(3)
        arrow(ctx, hand, center, lw(12))
      }
    }
  }

  // Skeleton.
  const kp = f.keypoints[i]
  if (kp) {
    ctx.beginPath()
    for (const [a, b] of f.edges) {
      const pa = kp[a]
      const pb = kp[b]
      if (!pa || !pb || pa[2] < MIN_SCORE || pb[2] < MIN_SCORE) continue
      ctx.moveTo(pa[0], pa[1])
      ctx.lineTo(pb[0], pb[1])
    }
    ctx.strokeStyle = COLORS.outline
    ctx.lineWidth = lw(5)
    ctx.stroke()
    ctx.strokeStyle = COLORS.bone
    ctx.lineWidth = lw(2.5)
    ctx.stroke()
    ctx.fillStyle = COLORS.joint
    ctx.strokeStyle = COLORS.outline
    ctx.lineWidth = lw(1.25)
    for (const p of kp) {
      if (!p || p[2] < MIN_SCORE) continue
      ctx.beginPath()
      ctx.arc(p[0], p[1], lw(2.75), 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // COG path (last ~1 s, fading), plumb line, COG dot.
  const span = Math.round(f.fps)
  for (let j = Math.max(1, i - span); j <= i; j++) {
    const a = f.cog[j - 1]
    const b = f.cog[j]
    if (!a || !b) continue
    const age = (i - j) / span
    ctx.strokeStyle = `rgba(${COLORS.cogPath},${(1 - age) * 0.9})`
    ctx.lineWidth = lw(3)
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  if (cog) {
    ctx.strokeStyle = COLORS.plumb
    ctx.lineWidth = lw(1.5)
    ctx.setLineDash([lw(5), lw(5)])
    ctx.beginPath()
    ctx.moveTo(cog[0], cog[1])
    ctx.lineTo(cog[0], f.height)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.save()
    ctx.shadowColor = COLORS.cogGlow
    ctx.shadowBlur = lw(10)
    ctx.fillStyle = COLORS.cog
    ctx.beginPath()
    ctx.arc(cog[0], cog[1], lw(7), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = COLORS.outline
    ctx.lineWidth = lw(2)
    ctx.stroke()
  }

  // Event label for ~0.4 s after each event.
  const ev = f.events.find((e) => i >= e.frame && i - e.frame < f.fps * 0.4)
  if (ev) {
    const label = EVENT_LABEL[ev.kind] ?? ev.kind
    ctx.font = `600 ${lw(15)}px ${COLORS.font}`
    const w = ctx.measureText(label).width + lw(16)
    ctx.fillStyle = COLORS.labelBg
    ctx.beginPath()
    ctx.roundRect(lw(10), lw(10), w, lw(26), lw(8))
    ctx.fill()
    ctx.fillStyle = COLORS.label
    ctx.textBaseline = 'middle'
    ctx.fillText(label, lw(18), lw(23))
  }
}
