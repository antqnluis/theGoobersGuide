import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

export function localClient() {
  const env = loadEnv('development', process.cwd(), 'VITE_')
  const url = new URL(env.VITE_SUPABASE_URL)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '54321') {
    throw new Error(
      'Campaign integration tests require the repository local Supabase stack on port 54321.',
    )
  }
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function localDatabaseQuery(sql: string, variables: Record<string, string>) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_backend',
      'psql',
      '-XqAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      ...Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`]),
    ],
    { input: sql, encoding: 'utf8' },
  ).trim()
}
