import type { Attempt, Cue, CueOccurrence, ResultJson } from './types'

/** The attempts to show. Results before v1.5 (or with no attempts found) become one attempt from `trim`. */
export function attemptsOf(r: ResultJson, duration: number): Attempt[] {
  if (r.attempts && r.attempts.length > 0) return r.attempts
  return [
    {
      index: 0,
      start: r.trim?.start ?? 0,
      end: Math.min(r.trim?.end ?? duration, duration),
      leave_ground: r.trim?.leave_ground ?? null,
      land: r.trim?.land ?? null,
      fall: r.fall,
      target_hold: r.target_hold,
      cues: r.cues,
      no_cue_reason: r.no_cue_reason,
    },
  ]
}

/** Where a cue happened. Pre-v1.5 cues have one occurrence at their own time. */
export function occurrencesOf(c: Cue, fallbackAttempt: number): CueOccurrence[] {
  if (c.occurrences && c.occurrences.length > 0) return c.occurrences
  return [{ attempt: c.attempt ?? fallbackAttempt, frame: c.frame, time: c.time, confidence: c.confidence }]
}

/** Position in `atts` of the attempt with this `index` (-1 when not found). */
export function attemptPos(atts: Attempt[], index: number | undefined): number {
  return index == null ? -1 : atts.findIndex((a) => a.index === index)
}

/** Position of the attempt that contains time `t`, else `fallback`. */
export function attemptAt(atts: Attempt[], t: number, fallback: number): number {
  const i = atts.findIndex((a) => t >= a.start && t <= a.end)
  return i === -1 ? fallback : i
}

/** The result as the overlay should see it for one attempt: that attempt's fall and target hold. */
export function viewFor(r: ResultJson, a: Attempt | undefined): ResultJson {
  if (!a || !r.attempts?.length) return r
  return { ...r, fall: a.fall, target_hold: a.target_hold }
}
