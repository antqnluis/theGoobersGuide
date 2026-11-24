import { useId, useRef, useState } from 'react'
import { validatePortraitFile } from '../characters/characterValidation'
import type { Npc } from './npcTypes'
import type { useNpcActions } from './useNpcActions'

type PortraitActions = Pick<
  ReturnType<typeof useNpcActions>,
  'setPortrait' | 'clearPortrait' | 'pendingAction' | 'pendingNpcId'
>

/**
 * Choose or remove an NPC's picture, as quiet actions under the portrait. Author only; saves as
 * soon as a file is chosen.
 */
export function NpcPortraitEditor({
  actions,
  buttonRef,
  npc,
  onNotice,
}: {
  actions: PortraitActions
  /** Lets the page send focus here, after an NPC is created. */
  buttonRef?: React.Ref<HTMLButtonElement>
  npc: Pick<Npc, 'id' | 'name' | 'portrait_path'>
  onNotice: (notice: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const [problem, setProblem] = useState<string | null>(null)
  const busy = actions.pendingAction !== null && actions.pendingNpcId === npc.id
  const saving = busy && actions.pendingAction === 'portrait'
  const path = npc.portrait_path ?? null

  async function choose(file: File | undefined) {
    if (!file) return
    const found = validatePortraitFile(file)
    setProblem(found)
    if (found) return
    const result = await actions.setPortrait(npc.id, file, path)
    if (result.ok) onNotice('Picture updated.')
  }

  async function remove() {
    if (!path) return
    setProblem(null)
    const result = await actions.clearPortrait(npc.id, path)
    if (result.ok) onNotice('Picture removed.')
  }

  return (
    <div className="npc-portrait-editor">
      <button
        aria-busy={saving || undefined}
        aria-describedby={hintId}
        className="journal-button journal-button--ghost npc-portrait-editor__button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        ref={buttonRef}
        type="button"
      >
        {saving ? 'Saving picture…' : path ? 'Change picture' : 'Add a picture'}
      </button>
      {path && (
        <button
          className="journal-button journal-button--ghost npc-portrait-editor__button"
          disabled={busy}
          onClick={() => void remove()}
          type="button"
        >
          Remove picture
        </button>
      )}
      <input
        accept="image/png,image/jpeg,image/webp"
        aria-label="NPC picture file"
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
      <p className="visually-hidden" id={hintId}>
        PNG, JPEG, or WebP, up to 2 MB. Anyone who can see this NPC can see the picture.
      </p>
      {!path && (
        <p aria-hidden="true" className="npc-portrait-editor__hint">
          PNG, JPEG, or WebP · 2 MB
        </p>
      )}
      {problem && (
        <p className="journal-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
