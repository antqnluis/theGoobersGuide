import { createClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from './supabaseConfig'

// This fallback permits client initialization before local environment setup is complete.
// It is not a credential and cannot access a Supabase project.
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey || 'missing-local-publishable-key',
)
