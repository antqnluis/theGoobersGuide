import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import {
  campaignCustomSpritesKey,
  removeCampaignCustomSprite,
  saveCampaignCustomSprite,
  spriteError,
} from './camp/campCustomSprites'
import { readSpriteFile } from './camp/customSprite'

export type SpriteAction = 'upload' | 'remove'

const fallbackCopy: Record<SpriteAction, string> = {
  upload: "We couldn't save your sprite. Check your connection and try again.",
  remove: "We couldn't remove the sprite. Check your connection and try again.",
}

/**
 * Uploading and removing custom sprites in one campaign. Each action resolves to whether it
 * took effect; failures surface as safe copy. `remove` takes a profile id, so the campaign's
 * owner can remove another player's sprite (the database enforces who may).
 */
export function useCampaignCustomSprite(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const uploadMutation = useMutation({
    mutationFn: (pixels: string) => saveCampaignCustomSprite(campaignId, pixels),
  })
  const removeMutation = useMutation({
    mutationFn: (profileId: string) => removeCampaignCustomSprite(campaignId, profileId),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: campaignCustomSpritesKey(campaignId, userId) })
  const clearError = useCallback(() => setError(null), [])

  const upload = async (file: File) => {
    setError(null)
    const result = await readSpriteFile(file)
    if (!result.ok) {
      setError(result.reason)
      return false
    }
    try {
      await uploadMutation.mutateAsync(result.encoded)
      await refresh()
      return true
    } catch (failure) {
      setError(spriteError(failure, fallbackCopy.upload))
      return false
    }
  }

  const remove = async (profileId: string) => {
    setError(null)
    try {
      await removeMutation.mutateAsync(profileId)
      await refresh()
      return true
    } catch (failure) {
      setError(spriteError(failure, fallbackCopy.remove))
      return false
    }
  }

  const pendingAction: SpriteAction | null = uploadMutation.isPending
    ? 'upload'
    : removeMutation.isPending
      ? 'remove'
      : null

  return { error, clearError, pendingAction, upload, remove }
}
