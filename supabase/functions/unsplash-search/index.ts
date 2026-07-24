import { allowedOrigin, corsHeaders, json } from '../_shared/cors.ts'

const ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY')
const UTM_SOURCE = Deno.env.get('UNSPLASH_UTM_SOURCE') ?? 'night_city_news'
const ORIENTATIONS = new Set(['landscape', 'portrait', 'squarish'])

function withAttribution(url: string): string {
  const target = new URL(url)
  target.searchParams.set('utm_source', UTM_SOURCE)
  target.searchParams.set('utm_medium', 'referral')
  return target.toString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (!allowedOrigin(req)) return json(req, { error: 'Origin not allowed' }, 403)
  if (req.method !== 'GET') return json(req, { error: 'Method not allowed' }, 405)
  if (!ACCESS_KEY) return json(req, { error: 'UNSPLASH_ACCESS_KEY is not configured' }, 500)

  const incoming = new URL(req.url)
  const query = (incoming.searchParams.get('query') ?? '').trim()
  const page = Math.min(50, Math.max(1, Number(incoming.searchParams.get('page') ?? '1') || 1))
  const orientation = incoming.searchParams.get('orientation') ?? ''

  if (query.length < 2 || query.length > 80) {
    return json(req, { error: 'Query must be between 2 and 80 characters' }, 400)
  }
  if (orientation && !ORIENTATIONS.has(orientation)) {
    return json(req, { error: 'Invalid orientation' }, 400)
  }

  const upstream = new URL('https://api.unsplash.com/search/photos')
  upstream.searchParams.set('query', query)
  upstream.searchParams.set('page', String(page))
  upstream.searchParams.set('per_page', '18')
  upstream.searchParams.set('content_filter', 'high')
  upstream.searchParams.set('order_by', 'relevant')
  if (orientation) upstream.searchParams.set('orientation', orientation)

  const response = await fetch(upstream, {
    headers: {
      Authorization: `Client-ID ${ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  })

  const payload = await response.json()
  if (!response.ok) {
    const message = Array.isArray(payload?.errors) ? payload.errors.join('; ') : 'Unsplash request failed'
    return json(req, { error: message }, response.status)
  }

  const results = (payload.results ?? []).map((photo: any) => ({
    id: photo.id,
    provider: 'unsplash',
    width: photo.width,
    height: photo.height,
    color: photo.color,
    blurHash: photo.blur_hash,
    alt: photo.alt_description ?? photo.description ?? 'Unsplash photograph',
    urls: {
      thumb: photo.urls.thumb,
      small: photo.urls.small,
      regular: photo.urls.regular,
    },
    photographer: {
      name: photo.user?.name ?? photo.user?.username ?? 'Unsplash photographer',
      username: photo.user?.username ?? '',
      url: withAttribution(photo.user.links.html),
    },
    photoUrl: withAttribution(photo.links.html),
    unsplashUrl: withAttribution('https://unsplash.com/'),
    downloadLocation: photo.links.download_location,
  }))

  return json(req, {
    page,
    total: payload.total ?? results.length,
    totalPages: payload.total_pages ?? 1,
    results,
  }, 200, {
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    'X-Upstream-RateLimit-Remaining': response.headers.get('x-ratelimit-remaining') ?? '',
  })
})
