import { getServerClient } from '@/lib/supabase/server'
import { Profile } from '@/types'

export async function getOrCreateProfile(userId: string, email: string): Promise<Profile> {
  const supabase = getServerClient()

  // Try to get existing profile
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (existingProfile && !fetchError) {
    return existingProfile as Profile
  }

  // Profile doesn't exist, create it
  const { data: newProfile, error: createError } = await supabase
    .from('profiles')
    .insert([
      {
        user_id: userId,
        email,
        plan: 'free',
        generations_used: 0,
      },
    ])
    .select()
    .single()

  if (createError || !newProfile) {
    throw new Error('Failed to create profile')
  }

  return newProfile as Profile
}
