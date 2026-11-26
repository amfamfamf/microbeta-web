// Types that mirror microbeta-backend/CONTRACT.md (v1). Change the contract first.

export type JobStatus = 'uploaded' | 'analyzing' | 'ready' | 'failed'
export type WallHint = 'slab' | 'vertical' | 'overhang' | 'roof'

export interface Job {
  id: string
  user_id: string
  status: JobStatus
  error: string | null
  video_path: string
  wall_hint: WallHint | null
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
  } | null
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
