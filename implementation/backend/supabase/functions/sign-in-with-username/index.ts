import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const url = Deno.env.get('SUPABASE_URL')!
const options = { auth: { autoRefreshToken: false, persistSession: false } }
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options)
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function reply(status: number, body: object) {
  return Response.json(body, { status, headers })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const input = await request.json().catch(() => null)
  if (typeof input?.username !== 'string' || typeof input?.password !== 'string') {
    return reply(400, { error: 'invalid_request' })
  }

  const username = input.username.trim()
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username) || !input.password) {
    return reply(400, { error: 'invalid_request' })
  }

  try {
    const { data: email, error: lookupError } = await admin.rpc('resolve_username_email', {
      account_username: username.toLowerCase(),
    })
    if (lookupError) return reply(503, { error: 'sign_in_unavailable' })

    // Unknown usernames still go through Auth's password endpoint and rate limit.
    const verifier = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options)
    const { data, error } = await verifier.auth.signInWithPassword({
      email: email ?? `missing-${crypto.randomUUID()}@accounts.goobersguide.invalid`,
      password: input.password,
    })
    if (error?.status === 429) return reply(429, { error: 'too_many_attempts' })
    if (error && (error.status === undefined || error.status >= 500)) {
      return reply(503, { error: 'sign_in_unavailable' })
    }
    if (!email || !data.session) return reply(401, { error: 'invalid_credentials' })

    return reply(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  } catch {
    return reply(503, { error: 'sign_in_unavailable' })
  }
})
