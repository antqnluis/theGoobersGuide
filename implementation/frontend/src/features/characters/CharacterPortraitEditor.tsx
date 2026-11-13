import { useRef, useState } from 'react'
import { CharacterMedallion } from './CharacterBadges'
import { validatePortraitFile } from './characterValidation'
import type { CharacterSummary } from './characterTypes'
import { PixelIcon } from './PixelIcon'
import type { useCharacterActions } from './useCharacterActions'

type PortraitActions = Pick<
  ReturnType<typeof useCharacterActions>,
  'setPortrait' | 'clearPortrait' | 'pendingAction' | 'pendingCharacterId'
>

/** Choose or remove a character's picture. Saves as soon as a file is chosen. */
export function CharacterPortraitEditor({
  character,
  actions,
  onNotice,
}: {
  character: CharacterSummary
  actions: PortraitActions
  onNotice: (notice: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const busy = actions.pendingAction !== null && actions.pendingCharacterId === character.id
  const saving = busy && actions.pendingAction === 'portrait'
  const path = character.portrait_path ?? null

  async function choose(file: File | undefined) {
    if (!file) return
    const found = validatePortraitFile(file)
    setProblem(found)
    if (found) return
    if (await actions.setPortrait(character.id, file, path)) onNotice('Portrait updated.')
  }

  async function remove() {
    if (!path) return
    setProblem(null)
    if (await actions.clearPortrait(character.id, path)) onNotice('Portrait removed.')
  }

  return (
    <div className="portrait-editor">
      <CharacterMedallion character={character} size={96} />
      <div className="portrait-editor__body">
        <p className="journal-label">Portrait</p>
        <div className="journal-actions">
          <button
            aria-busy={saving || undefined}
            className="journal-button journal-button--secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <PixelIcon name="quill" />
            {saving ? 'Saving picture…' : path ? 'Change picture' : 'Upload picture'}
          </button>
          {path && (
            <button
              className="journal-button journal-button--danger"
              disabled={busy}
              onClick={() => void remove()}
              type="button"
            >
              Remove picture
            </button>
          )}
        </div>
        <input
          accept="image/png,image/jpeg,image/webp"
          aria-label="Portrait file"
          className="visually-hidden"
          disabled={busy}
          onChange={(event) => {
            void choose(event.target.files?.[0])
            // Choosing the same file again should still count.
            event.target.value = ''
          }}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
        <p className="portrait-editor__hint">
          PNG, JPEG, or WebP, up to 2 MB. Everyone in the campaign can see it.
        </p>
        {problem && (
          <p className="journal-error" role="alert">
            {problem}
          </p>
        )}
      </div>
    </div>
  )
}
