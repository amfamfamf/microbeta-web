// Types that mirror microbeta-backend/CONTRACT.md (v1). Change the contract first.

/** v1.1: optional tap on the target hold, normalized 0..1 on the video's own pixels. */
export interface TargetHint {
  x: number
  y: number
}

export type JobStatus = 'uploaded' | 'analyzing' | 'ready' | 'failed'
export type WallHint = 'slab' | 'vertical' | 'overhang' | 'roof'

export type QualityCheckId = 'frame_rate' | 'full_body' | 'target_hold'

export type HoldColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'black' | 'white' | 'grey'

export interface QualityCheck {
  id: QualityCheckId
  ok: boolean
  message: string | null
  tip: string | null
}

export interface QualityReport {
  passed: boolean
  checks: QualityCheck[]
}

export interface Job {
  id: string
  user_id: string
  status: JobStatus
  error: string | null
  video_path: string
  wall_hint: WallHint | null
  target_hint: TargetHint | null
  /** v1.2: upload quality check, written by the worker. */
  quality?: QualityReport | null
  /** v1.2: wall angle in degrees from vertical (-30 slab .. 90 roof), picked at upload. */
  wall_angle_deg?: number | null
  /** v1.2: the color of the problem's holds, picked at upload. */
  hold_color?: HoldColor | null
  /** v1.2: clip length in seconds, read by the browser before upload. */
  duration_s?: number | null
  created_at: string
  updated_at: string
}

export interface ResultsRow {
  job_id: string
  result: ResultJson
  features_path: string
  video_path: string
  created_at: string
}

export type FallKind = 'hand_off' | 'foot_cut_then_off' | 'swing_off' | 'barn_door' | 'short_reach'
export type WallClass = WallHint | 'unknown'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Cue {
  rule_id: number
  category: string
  title: string
  text: string
  frame: number
  time: number
  confidence: number
  evidence: Record<string, unknown>
}

export interface ResultJson {
  version: number
  fps: number
  width: number
  height: number
  duration: number
  fall: {
    frame: number
    drop_frame: number
    time: number
    kind: FallKind
    confidence: number
  } | null
  wall: { class: WallClass; confidence: number; source: string }
  target_hold: (Box & { id: number }) | null
  holds: {
    holds: (Box & { id: number; area: number; hue_bin: number; problem: boolean })[]
    problem_hue_bin: number | null
    confidence: number
    /** v1.1: the hold the user tapped, or null. */
    tapped_id?: number | null
  } | null
  /** v1.1, informational. */
  camera?: { moved: boolean; max_shift_px: number | null; jitter_px: number | null; checked?: number }
  /** v1.1: filming tips, always an array (optional here for v1 results). */
  warnings?: string[]
  cues: Cue[]
  no_cue_reason: string | null
  safety_note: string | null
}

export type Point = [number, number]
export type Keypoint = [number, number, number] | null
export type LimbName = 'l_hand' | 'r_hand' | 'l_foot' | 'r_foot'
export const LIMBS: LimbName[] = ['l_hand', 'r_hand', 'l_foot', 'r_foot']

export type EventKind = 'foot_cut' | 'release' | 'catch' | 'foot_place' | 'deadpoint' | 'dyno'

export interface FeaturesJson {
  version: number
  fps: number
  width: number
  height: number
  keypoint_names: string[]
  edges: [number, number][]
  /** keypoints[frame][joint] */
  keypoints: (Keypoint[] | null)[]
  cog: (Point | null)[]
  contacts: Record<LimbName, boolean[]>
  limbs: Record<LimbName, (Point | null)[]>
  events: { kind: EventKind; frame: number; time: number; limb: LimbName | null }[]
}

export type CueFlag = 'wrong_cue' | 'wrong_fall_frame'
export type CueRating = 'up' | 'down'

export interface CueFeedbackRow {
  id: number
  job_id: string
  user_id: string
  cue_index: number
  rating: CueRating | null
  flag: CueFlag | null
  note: string | null
  created_at: string
}

/** Callbacks the result view uses to save feedback. Absent = read-only (share, demo). */
export interface FeedbackApi {
  get(cueIndex: number): Pick<CueFeedbackRow, 'rating' | 'flag'> | undefined
  save(cueIndex: number, patch: { rating?: CueRating | null; flag?: CueFlag | null }): Promise<void>
}
