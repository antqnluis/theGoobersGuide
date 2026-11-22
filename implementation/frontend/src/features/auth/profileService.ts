import { supabase } from '../../lib/supabase'

/** The signed-in player's own display name; null when none is set. */
export async function getOwnDisplayName(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as { display_name: string | null } | null)?.display_name ?? null
}

export async function updateOwnDisplayName(userId: string, displayName: string | null) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select('display_name')

  if (error) throw error
  if (!data?.length) throw new Error('Display name could not be updated by this account.')
}
