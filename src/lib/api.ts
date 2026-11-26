import { API_URL } from './env'
import type { ResultJson } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readDetail(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json()
    return typeof body?.detail === 'string' ? body.detail : undefined
  } catch {
    return undefined
  }
}

/** Step 3 of the upload flow. Every error message tells the user what to do next. */
export async function startJob(jobId: string, accessToken: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/jobs/${jobId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new ApiError(0, 'Could not reach the analysis server. Check your connection, then tap “Start analysis” again.')
  }
  if (res.status === 202 || res.ok) return
  const detail = await readDetail(res)
  switch (res.status) {
    case 401:
      throw new ApiError(401, 'Your sign-in expired. Sign out, sign in again, then tap “Start analysis”.')
    case 403:
      throw new ApiError(403, detail === 'not_invited'
        ? 'Your account is not on the invite list yet. Ask the owner for an invite.'
        : 'You are not allowed to start this job. Sign in with the invited Google account.')
    case 404:
      throw new ApiError(404, 'The server could not find this job. Go back to “My videos” and upload it again.')
    case 409:
      throw new ApiError(409, 'This video is already being analyzed. Open “My videos” to follow it.')
    case 429:
      throw new ApiError(429, 'You reached today’s limit of 10 videos. Try again tomorrow.')
    default:
      throw new ApiError(res.status, `The analysis server had a problem (${res.status}). Wait a minute, then tap “Start analysis” again.`)
  }
}

export interface SharePayload {
  result: ResultJson
  video_url: string
  features_url: string
}

export async function fetchShare(token: string): Promise<SharePayload> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/share/${encodeURIComponent(token)}`)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection, then reload this page.')
  }
  if (res.ok) return (await res.json()) as SharePayload
  if (res.status === 404) throw new ApiError(404, 'This share link does not exist. Ask the climber to send it again.')
  if (res.status === 410) throw new ApiError(410, 'This share link expired. Links last 7 days. Ask the climber for a new one.')
  throw new ApiError(res.status, `The server had a problem (${res.status}). Reload the page in a minute.`)
}

export async function fetchJson<T>(url: string, what: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error(`Could not download the ${what}. Check your connection, then reload.`)
  }
  if (!res.ok) throw new Error(`Could not download the ${what} (${res.status}). Reload the page; if it keeps failing, upload the video again.`)
  return (await res.json()) as T
}
