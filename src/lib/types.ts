// Types that mirror microbeta-backend/CONTRACT.md (v1). Change the contract first.

/** v1.1: optional tap on the target hold, normalized 0..1 on the video's own pixels. */
export interface TargetHint {
  x: number
  y: number
}

export type JobStatus = 'uploaded' | 'analyzing' | 'ready' | 'failed'
export type WallHint = 'slab' | 'vertical' | 'overhang' | 'roof'

export type QualityCheckId = 'frame_rate' | 'full_body' | 'target_hold'

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
  /** Set when the 30-day cleanup removed the original upload. */
  original_deleted_at?: string | null
  target_hint: TargetHint | null
  /** v1.2: upload quality check, written by the worker. */
  quality?: QualityReport | null
  /** v1.2: wall angle in degrees from vertical (-30 slab .. 90 roof), picked at upload. */
  wall_angle_deg?: number | null
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
  /** v1.5: index of the attempt this cue (its best occurrence) comes from. */
  attempt?: number
  /** v1.5 (top-level cues only): every attempt where this rule fired at or above min_confidence (0.4), in time order. */
  occurrences?: CueOccurrence[]
}

export interface CueOccurrence {
  attempt: number
  frame: number
  time: number
  confidence: number
}

export interface Fall {
  frame: number
  drop_frame: number
  time: number
  kind: FallKind
  confidence: number
}

/** v1.5: one attempt (leave the ground → land), analyzed like a whole v1.4 clip. Seconds/frames in video.mp4. */
export interface Attempt {
  index: number
  start: number
  end: number
  leave_ground: number | null
  land: number | null
  fall: Fall | null
  target_hold: (Box & { id: number }) | null
  cues: Cue[]
  no_cue_reason: string | null
}

export interface ResultJson {
  version: number
  fps: number
  width: number
  height: number
  duration: number
  fall: Fall | null
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
  /** v1.4: play window, seconds in video.mp4 (0.5 s before leaving the ground to 0.5 s after landing). */
  trim?: { start: number; end: number; leave_ground: number | null; land: number | null; pad_s: number }
  /** v1.5: one entry per attempt. Missing on older results: treat the clip as one attempt. */
  attempts?: Attempt[]
  /** v1.5: every cue at or above min_confidence (0.4) from any attempt, merged by rule, best first. */
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
  /**
   * v1.6 (proposed): per frame, the affine [a, b, c, d, tx, ty] that maps a wall point from reference coordinates
   * (frame 0; holds and target_hold use these) to that frame: x' = a·x + b·y + tx, y' = c·x + d·y + ty.
   * `null` = unknown (use the nearest known frame). Missing = still camera.
   */
  wall_transform?: (Affine | null)[]
}

export type Affine = [number, number, number, number, number, number]

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
