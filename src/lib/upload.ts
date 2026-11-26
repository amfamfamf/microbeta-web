import * as tus from 'tus-js-client'
import { SUPABASE_URL } from './env'

export function extensionFor(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  const fromType: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
    'video/3gpp': '3gp',
  }
  return fromType[file.type] ?? 'mp4'
}

/** Read the video length in the browser. Rejects when the browser cannot read the file. */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const done = () => URL.revokeObjectURL(url)
    v.onloadedmetadata = () => {
      const d = v.duration
      done()
      if (Number.isFinite(d) && d > 0) resolve(d)
      else reject(new Error('unknown duration'))
    }
    v.onerror = () => {
      done()
      reject(new Error('unreadable'))
    }
    v.src = url
  })
}

export class UploadAborted extends Error {
  constructor() {
    super('aborted')
  }
}

interface UploadArgs {
  file: File
  bucket: string
  objectName: string
  accessToken: string
  onProgress: (fraction: number) => void
}

/** Resumable upload to Supabase Storage (TUS). Supabase requires 6 MB chunks. */
export function uploadResumable({ file, bucket, objectName, accessToken, onProgress }: UploadArgs) {
  let upload: tus.Upload | null = null
  let rejectFn: (e: Error) => void = () => {}
  const promise = new Promise<void>((resolve, reject) => {
    rejectFn = reject
    upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${accessToken}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName,
        contentType: file.type || 'video/mp4',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => reject(err),
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
    })
    const u = upload
    u.findPreviousUploads().then((prev) => {
      if (prev.length) u.resumeFromPreviousUpload(prev[0])
      u.start()
    })
  })
  const abort = () => {
    upload?.abort()
    rejectFn(new UploadAborted())
  }
  return { promise, abort }
}
