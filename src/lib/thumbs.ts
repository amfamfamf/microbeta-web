import { useEffect, useState } from 'react'
import { objectPath, requireSupabase } from './supabase'
import type { Job } from './types'

const THUMB_W = 480

/** Folder of a job's files in both buckets: `{user_id}/{job_id}`. */
export function jobBase(job: Pick<Job, 'id' | 'user_id'>): string {
  return `${job.user_id}/${job.id}`
}

export function thumbPath(job: Pick<Job, 'id' | 'user_id'>): string {
  return `${jobBase(job)}/thumb.jpg`
}

/** A JPEG of the clip's first moment (0.5 s in), at most 480 px wide. Rejects if the browser cannot decode it. */
export function makeThumb(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    const done = (fn: () => void) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      v.removeAttribute('src')
      v.load()
      fn()
    }
    const timer = setTimeout(() => done(() => reject(new Error('thumbnail timeout'))), 8000)
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2)
    }
    v.onseeked = () => {
      const scale = Math.min(1, THUMB_W / (v.videoWidth || THUMB_W))
      const c = document.createElement('canvas')
      c.width = Math.round(v.videoWidth * scale)
      c.height = Math.round(v.videoHeight * scale)
      const ctx = c.getContext('2d')
      if (!ctx || !c.width) return done(() => reject(new Error('no frame')))
      ctx.drawImage(v, 0, 0, c.width, c.height)
      c.toBlob((b) => done(() => (b ? resolve(b) : reject(new Error('no blob')))), 'image/jpeg', 0.75)
    }
    v.onerror = () => done(() => reject(new Error('cannot decode')))
    v.src = url
  })
}

/** Best effort: a missing thumbnail only means the grid falls back to the video's own first frame. */
export async function uploadThumb(job: Pick<Job, 'id' | 'user_id'>, file: File): Promise<void> {
  try {
    const blob = await makeThumb(file)
    await requireSupabase().storage.from('videos').upload(thumbPath(job), blob, { contentType: 'image/jpeg', upsert: true })
  } catch {
    /* no thumbnail */
  }
}

export interface Tile {
  /** Image URL (thumb.jpg). */
  img?: string
  /** Video URL to show its first frame when there is no thumbnail (older uploads). */
  video?: string
}

/** Signed URLs for each job's tile, in two batched requests. */
export function useTiles(jobs: Job[] | null): Record<string, Tile> {
  const [tiles, setTiles] = useState<Record<string, Tile>>({})
  const key = (jobs ?? []).map((j) => j.id + j.status).join(',')

  useEffect(() => {
    if (!jobs?.length) return
    const sb = requireSupabase()
    let cancelled = false
    ;(async () => {
      const out: Record<string, Tile> = {}
      const { data: imgs } = await sb.storage.from('videos').createSignedUrls(jobs.map(thumbPath), 3600)
      const missing: Job[] = []
      jobs.forEach((j, i) => {
        const s = imgs?.[i]
        if (s && !s.error && s.signedUrl) out[j.id] = { img: s.signedUrl }
        else missing.push(j)
      })
      // Fallback: the analyzed clip when ready, else the original upload (kept 30 days).
      const ready = missing.filter((j) => j.status === 'ready')
      const raw = missing.filter((j) => j.status !== 'ready' && !j.original_deleted_at)
      const [r1, r2] = await Promise.all([
        ready.length ? sb.storage.from('results').createSignedUrls(ready.map((j) => `${jobBase(j)}/video.mp4`), 3600) : null,
        raw.length ? sb.storage.from('videos').createSignedUrls(raw.map((j) => objectPath(j.video_path, 'videos')), 3600) : null,
      ])
      ready.forEach((j, i) => {
        const u = r1?.data?.[i]?.signedUrl
        if (u) out[j.id] = { video: u }
      })
      raw.forEach((j, i) => {
        const u = r2?.data?.[i]?.signedUrl
        if (u) out[j.id] = { video: u }
      })
      if (!cancelled) setTiles(out)
    })().catch(() => {
      /* tiles stay blank */
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return tiles
}

/** Delete a job and its files. The row goes first: its policy refuses a job that is still analyzing. */
export async function deleteJob(job: Job): Promise<void> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('jobs').delete().eq('id', job.id).select('id')
  if (error || !data?.length) {
    throw new Error(
      job.status === 'analyzing'
        ? 'This video is still being analyzed. Delete it when the analysis finishes.'
        : 'We could not delete this video. Check your connection, then try again.',
    )
  }
  const base = jobBase(job)
  await Promise.allSettled([
    sb.storage.from('videos').remove([objectPath(job.video_path, 'videos'), `${base}/thumb.jpg`]),
    sb.storage.from('results').remove([`${base}/video.mp4`, `${base}/features.json`, `${base}/result.json`]),
  ])
}
