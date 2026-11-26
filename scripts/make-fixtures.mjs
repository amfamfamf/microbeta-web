#!/usr/bin/env node
// Generates the demo fixture in public/demo/: a synthetic 3 s stick-figure fall
// (video.mp4 via ffmpeg) plus features.json / result.json that follow CONTRACT.md v1.
// The overlay must sit exactly on the drawn figure: that is the sync test.
// Usage: npm run fixtures   (needs ffmpeg on PATH)
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo')
mkdirSync(OUT, { recursive: true })

const W = 720
const H = 1280
const FPS = 30
const N = 90 // 3 s

const NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
  'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  'head', 'neck', 'hip', 'left_big_toe', 'right_big_toe', 'left_small_toe', 'right_small_toe',
  'left_heel', 'right_heel',
]
const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 4], [17, 0], [17, 18], [18, 19],
  [18, 5], [18, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [19, 11], [19, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [15, 20], [15, 22], [15, 24], [16, 21], [16, 23], [16, 25],
]

// Holds (pixels in the 720x1280 frame).
const HOLD = {
  lh: [300, 430], rhStart: [450, 480], target: [452, 238],
  lf: [270, 930], rf: [430, 900],
}
const HOLDS = [
  { id: 0, x: 280, y: 412, w: 40, h: 34, hue: [80, 200, 255] },
  { id: 1, x: 430, y: 462, w: 40, h: 34, hue: [80, 200, 255] },
  { id: 2, x: 250, y: 915, w: 40, h: 30, hue: [80, 200, 255] },
  { id: 3, x: 410, y: 885, w: 40, h: 30, hue: [80, 200, 255] },
  { id: 7, x: 430, y: 220, w: 44, h: 36, hue: [80, 200, 255] },
  { id: 4, x: 140, y: 640, w: 36, h: 30, hue: [240, 120, 60] },
  { id: 5, x: 560, y: 700, w: 36, h: 30, hue: [240, 120, 60] },
  { id: 6, x: 600, y: 330, w: 34, h: 30, hue: [140, 220, 90] },
]
const TARGET = HOLDS.find((h) => h.id === 7)

const lerp = (a, b, t) => a + (b - a) * t
const lerp2 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)]
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t))
const add = (p, q) => [p[0] + q[0], p[1] + q[1]]

/** Two-link IK: joint between a and b with segment lengths l1, l2; bend sign picks the side. */
function ik(a, b, l1, l2, bend) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let d = Math.hypot(dx, dy)
  d = Math.min(d, l1 + l2 - 1e-3)
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  const ux = dx / (Math.hypot(dx, dy) || 1)
  const uy = dy / (Math.hypot(dx, dy) || 1)
  return [a[0] + ux * along - uy * h * bend, a[1] + uy * along + ux * h * bend]
}

/** Pull end-effector `p` toward `root` so it is within `max` reach. */
function clampReach(root, p, max) {
  const d = Math.hypot(p[0] - root[0], p[1] - root[1])
  if (d <= max) return p
  return lerp2(root, p, max / d)
}

// Timeline (frames).
const REACH_START = 18
const FOOT_CUT = 48
const FALL = 60 // left hand comes off
const DROP = 66

function pose(i) {
  const t = i / FPS
  // Contacts.
  const feetOn = i < FOOT_CUT
  const lhOn = i < FALL
  const rhOn = i < REACH_START

  // Hip path: settles, pushes up while reaching, swings out after the foot cut, then falls.
  let hip = [370, 780 - 30 * ease((i - REACH_START) / 30)]
  if (i >= FOOT_CUT) {
    const s = (i - FOOT_CUT) / FPS
    hip = [hip[0] + 90 * Math.sin(Math.min(s, 0.4) * 4) , hip[1] + 120 * ease(s / 0.4)]
  }
  if (i >= FALL) {
    const s = (i - FALL) / FPS
    hip = [hip[0] + 30 * s, hip[1] + 0.5 * 2600 * s * s]
  }

  // Torso leans toward the hands.
  const handsMid = lerp2(HOLD.lh, HOLD.rhStart, 0.5)
  const ang = Math.atan2(handsMid[1] - hip[1], handsMid[0] - hip[0])
  const torso = 165
  const neck = add(hip, [Math.cos(ang) * torso, Math.sin(ang) * torso])
  const perp = [-Math.sin(ang), Math.cos(ang)]
  const ls = add(neck, [perp[0] * -45, perp[1] * -45])
  const rs = add(neck, [perp[0] * 45, perp[1] * 45])
  const lhip = add(hip, [perp[0] * -28, perp[1] * -28])
  const rhip = add(hip, [perp[0] * 28, perp[1] * 28])
  const headC = add(neck, [Math.cos(ang) * 48, Math.sin(ang) * 48])

  // Hands.
  const ARM = 135
  let lw = lhOn ? HOLD.lh : add(clampReach(ls, HOLD.lh, ARM * 2), [0, 60 * (i - FALL) / 6])
  // Right hand reaches toward the target and stops short.
  const reachT = ease((i - REACH_START) / 32)
  let rw = rhOn ? HOLD.rhStart : lerp2(HOLD.rhStart, [TARGET.x + 20, TARGET.y + 70], reachT)
  if (i >= FALL) rw = add(rw, [10, 50 * (i - FALL) / 6])
  lw = clampReach(ls, lw, ARM * 2 - 2)
  rw = clampReach(rs, rw, ARM * 2 - 2)
  const le = ik(ls, lw, ARM, ARM, -1)
  const re = ik(rs, rw, ARM, ARM, 1)

  // Feet.
  const LEG = 125
  let la = feetOn ? HOLD.lf : add(lhip, [-40 + 70 * Math.sin(t * 6), 220])
  let ra = feetOn ? HOLD.rf : add(rhip, [60 + 70 * Math.sin(t * 6), 210])
  la = clampReach(lhip, la, LEG * 2 - 2)
  ra = clampReach(rhip, ra, LEG * 2 - 2)
  const lk = ik(lhip, la, LEG, LEG, 1)
  const rk = ik(rhip, ra, LEG, LEG, -1)

  const toe = (a, dir) => add(a, [dir * 26, 8])
  const kp = []
  kp[0] = add(headC, [0, 4])
  kp[1] = add(headC, [-10, -6])
  kp[2] = add(headC, [10, -6])
  kp[3] = add(headC, [-22, 0])
  kp[4] = add(headC, [22, 0])
  kp[5] = ls; kp[6] = rs; kp[7] = le; kp[8] = re; kp[9] = lw; kp[10] = rw
  kp[11] = lhip; kp[12] = rhip; kp[13] = lk; kp[14] = rk; kp[15] = la; kp[16] = ra
  kp[17] = add(headC, [0, -30])
  kp[18] = neck
  kp[19] = hip
  kp[20] = toe(la, -1); kp[21] = toe(ra, 1)
  kp[22] = add(la, [-14, 12]); kp[23] = add(ra, [14, 12])
  kp[24] = add(la, [8, 10]); kp[25] = add(ra, [-8, 10])

  const cog = [hip[0] * 0.6 + neck[0] * 0.4, hip[1] * 0.6 + neck[1] * 0.4]
  return { kp, cog, contacts: { l_hand: lhOn, r_hand: rhOn, l_foot: feetOn, r_foot: feetOn }, limbs: { l_hand: lw, r_hand: rw, l_foot: la, r_foot: ra } }
}

const r1 = (v) => Math.round(v * 10) / 10
const frames = Array.from({ length: N }, (_, i) => pose(i))

// Hide the pose for 2 frames to exercise `null` handling.
const MISSING = new Set([84, 85])

const features = {
  version: 1, fps: FPS, width: W, height: H,
  keypoint_names: NAMES,
  edges: EDGES,
  keypoints: frames.map((f, i) => (MISSING.has(i) ? null : f.kp.map((p, j) => [r1(p[0]), r1(p[1]), j <= 4 ? 0.8 : 0.95]))),
  cog: frames.map((f, i) => (MISSING.has(i) ? null : [r1(f.cog[0]), r1(f.cog[1])])),
  contacts: Object.fromEntries(['l_hand', 'r_hand', 'l_foot', 'r_foot'].map((k) => [k, frames.map((f) => f.contacts[k])])),
  limbs: Object.fromEntries(['l_hand', 'r_hand', 'l_foot', 'r_foot'].map((k) => [k, frames.map((f, i) => (MISSING.has(i) ? null : [r1(f.limbs[k][0]), r1(f.limbs[k][1])]))])),
  events: [
    { kind: 'release', frame: REACH_START, time: REACH_START / FPS, limb: 'r_hand' },
    { kind: 'foot_cut', frame: FOOT_CUT, time: FOOT_CUT / FPS, limb: null },
    { kind: 'release', frame: FALL, time: FALL / FPS, limb: 'l_hand' },
  ].map((e) => ({ ...e, time: Math.round(e.time * 1000) / 1000 })),
}

const t3 = (f) => Math.round((f / FPS) * 1000) / 1000
const result = {
  version: 1, fps: FPS, width: W, height: H, duration: N / FPS,
  fall: { frame: FALL, drop_frame: DROP, time: t3(FALL), kind: 'foot_cut_then_off', confidence: 0.82 },
  wall: { class: 'overhang', confidence: 0.6, source: 'inferred' },
  target_hold: { id: TARGET.id, x: TARGET.x, y: TARGET.y, w: TARGET.w, h: TARGET.h },
  holds: {
    holds: HOLDS.map((h) => ({ id: h.id, x: h.x, y: h.y, w: h.w, h: h.h, area: h.w * h.h, hue_bin: h.hue[0] === 80 ? 3 : 1, problem: h.hue[0] === 80 })),
    problem_hue_bin: 3, confidence: 0.7,
  },
  cues: [
    {
      rule_id: 2, category: 'Feet', title: 'Keep your toes pulling',
      text: 'Your feet cut just before you fell. On the overhang, curl your toes and pull the footholds toward you until your hand is on the target hold.',
      frame: FOOT_CUT - 2, time: t3(FOOT_CUT - 2), confidence: 0.78,
      evidence: { foot_cut_time: t3(FOOT_CUT), hand_arrival_time: null, outward_speed: 1.9 },
    },
    {
      rule_id: 5, category: 'Hips', title: 'Hips to the wall',
      text: 'Your center of gravity was outside your base of support while you reached. Turn your hip in toward the wall to reach farther.',
      frame: 36, time: t3(36), confidence: 0.61,
      evidence: { cog_outside_base_s: 0.4, hip_wall_distance_px: 210 },
    },
    {
      rule_id: 9, category: 'Reach', title: 'Reach from your legs',
      text: 'You stopped about one hand short of the target. Push with your legs first, then reach.',
      frame: FALL - 3, time: t3(FALL - 3), confidence: 0.52,
      evidence: { reach_gap_px: 70, arm_extension: 0.98 },
    },
  ],
  no_cue_reason: null,
  safety_note: null,
}
const resultEmpty = {
  ...result,
  cues: [],
  no_cue_reason: 'We could not see your feet clearly before the fall, so we will not guess a cue. Film from a little farther back so your whole body is in frame.',
  safety_note: 'You landed close to the edge of the mat. Check the mat position before your next attempt.',
}

writeFileSync(join(OUT, 'features.json'), JSON.stringify(features))
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2))
writeFileSync(join(OUT, 'result-empty.json'), JSON.stringify(resultEmpty, null, 2))

// ---- Render the video with a tiny software rasterizer piped into ffmpeg. ----
const buf = Buffer.alloc(W * H * 3)
function fillBg() {
  for (let y = 0; y < H; y++) {
    const shade = 70 + Math.round((y / H) * 30)
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 3
      // Faint panel grid so motion is readable.
      const grid = x % 120 === 0 || y % 120 === 0 ? 12 : 0
      buf[k] = shade - 10 + grid
      buf[k + 1] = shade - 5 + grid
      buf[k + 2] = shade + 5 + grid
    }
  }
  // Mat.
  rect(0, 1180, W, 100, [40, 50, 90])
}
function rect(x0, y0, w, h, c) {
  for (let y = Math.max(0, y0 | 0); y < Math.min(H, (y0 + h) | 0); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(W, (x0 + w) | 0); x++) {
      const k = (y * W + x) * 3
      buf[k] = c[0]; buf[k + 1] = c[1]; buf[k + 2] = c[2]
    }
}
function disc(cx, cy, r, c) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
      const k = (y * W + x) * 3
      buf[k] = c[0]; buf[k + 1] = c[1]; buf[k + 2] = c[2]
    }
}
function line(a, b, r, c) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r))
  const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + r))
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r))
  const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + r))
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = dx * dx + dy * dy || 1
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L))
      const px = a[0] + t * dx - x
      const py = a[1] + t * dy - y
      if (px * px + py * py > r * r) continue
      const k = (y * W + x) * 3
      buf[k] = c[0]; buf[k + 1] = c[1]; buf[k + 2] = c[2]
    }
}

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '30', '-pix_fmt', 'yuv420p', '-g', '15',
  '-movflags', '+faststart', join(OUT, 'video.mp4'),
], { stdio: ['pipe', 'inherit', 'inherit'] })

const BODY = [235, 225, 210]
for (let i = 0; i < N; i++) {
  fillBg()
  for (const h of HOLDS) disc(h.x + h.w / 2, h.y + h.h / 2, Math.min(h.w, h.h) / 2 + 2, h.hue)
  const { kp } = frames[i]
  if (!MISSING.has(i)) {
    for (const [a, b] of EDGES) if (a > 4 && b > 4) line(kp[a], kp[b], 9, BODY)
    disc(kp[0][0], kp[0][1] - 12, 26, BODY)
  }
  // Frame-progress bar along the top (helps eyeball sync).
  rect(0, 0, Math.round(((i + 1) / N) * W), 6, [255, 176, 32])
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
}
ff.stdin.end()
await new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`)))))
console.log('Wrote', OUT)
