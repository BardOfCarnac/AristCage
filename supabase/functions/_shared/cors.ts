export function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin')
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!origin) return configured[0] ?? '*'
  if (configured.length === 0 || configured.includes('*') || configured.includes(origin)) return origin
  return null
}

export function corsHeaders(req: Request): HeadersInit {
  const origin = allowedOrigin(req)
  return {
    'Access-Control-Allow-Origin': origin ?? 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      ...extra,
    },
  })
}
