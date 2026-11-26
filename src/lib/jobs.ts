import { useEffect, useState } from 'react'
import { requireSupabase } from './supabase'
import type { Job, JobStatus } from './types'

export const STATUS_LABEL: Record<JobStatus, string> = {
  uploaded: 'Uploaded',
  analyzing: 'Analyzing',
  ready: 'Ready',
  failed: 'Failed',
}

/** All of the user's jobs, live via Supabase Realtime on `jobs`. */
export function useJobs(userId: string) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const sb = requireSupabase()
    let cancelled = false
    sb.from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: e }) => {
        if (cancelled) return
        if (e) setError('We could not load your videos. Check your connection, then tap “Try again”.')
        else {
          setError(null)
          setJobs((data ?? []) as Job[])
        }
      })
    const channel = sb
      .channel(`jobs-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${userId}` }, (payload) => {
        setJobs((prev) => {
          const list = prev ?? []
          if (payload.eventType === 'DELETE') return list.filter((j) => j.id !== (payload.old as Job).id)
          const row = payload.new as Job
          const i = list.findIndex((j) => j.id === row.id)
          if (i === -1) return [row, ...list]
          const copy = list.slice()
          copy[i] = row
          return copy
        })
      })
      .subscribe()
    return () => {
      cancelled = true
      sb.removeChannel(channel)
    }
  }, [userId, nonce])

  const retry = () => {
    setError(null)
    setNonce((n) => n + 1)
  }
  return { jobs, error, retry }
}

/** One job, live. */
export function useJob(jobId: string) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const sb = requireSupabase()
    let cancelled = false
    sb.from('jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (cancelled) return
        if (e) setError('We could not load this video. Check your connection, then tap “Try again”.')
        else if (!data) setError('This video does not exist, or it belongs to another account. Go to “My videos”.')
        else setJob(data as Job)
      })
    const channel = sb
      .channel(`job-${jobId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` }, (payload) => {
        setJob(payload.new as Job)
      })
      .subscribe()
    return () => {
      cancelled = true
      sb.removeChannel(channel)
    }
  }, [jobId, nonce])

  const retry = () => {
    setError(null)
    setNonce((n) => n + 1)
  }
  return { job, error, retry }
}
