import { allowedOrigin, corsHeaders, json } from '../_shared/cors.ts'

const ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY')

function validDownloadLocation(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === 'api.unsplash.com' &&
      /^\/photos\/[A-Za-z0-9_-]+\/download$/.test(url.pathname)
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (!allowedOrigin(req)) return json(req, { error: 'Origin not allowed' }, 403)
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)
  if (!ACCESS_KEY) return json(req, { error: 'UNSPLASH_ACCESS_KEY is not configured' }, 500)

  let body: { downloadLocation?: string }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }

  const downloadLocation = body.downloadLocation ?? ''
  if (!validDownloadLocation(downloadLocation)) {
    return json(req, { error: 'Invalid Unsplash download location' }, 400)
  }

  const response = await fetch(downloadLocation, {
    method: 'GET',
    headers: {
      Authorization: `Client-ID ${ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = Array.isArray(payload?.errors) ? payload.errors.join('; ') : 'Unsplash tracking failed'
    return json(req, { error: message }, response.status)
  }

  return json(req, { tracked: true }, 200, { 'Cache-Control': 'no-store' })
})
