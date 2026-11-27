import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { PixelIcon } from '../characters/PixelIcon'
import { craftingLimits } from './craftingPack'
import { craftingPackPrompt } from './craftingPackPrompt'
import {
  campaignLibrariesOptions,
  lastRestOptions,
  libraryImportsOptions,
  librariesOptions,
} from './craftingQueries'
import { previewLibraryDelete } from './craftingService'
import type { CraftingLibrary, LibraryDeletePreview, PackImport } from './craftingTypes'
import { LibraryBrowser } from './LibraryBrowser'
import { PackImportDialog } from './PackImportDialog'
import { describeImport, describeRest, formatRestTime, plural } from './craftingText'
import { useCraftingActions, type CraftingActions } from './useCraftingActions'
import './crafting.css'

function describePackImport(entry: PackImport) {
  const parts = [
    entry.items_added + entry.items_updated > 0 &&
      `${plural(entry.items_added, 'item')} added, ${entry.items_updated} updated`,
    entry.recipes_added + entry.recipes_updated > 0 &&
      `${plural(entry.recipes_added, 'recipe')} added, ${entry.recipes_updated} updated`,
    entry.items_removed + entry.recipes_removed > 0 &&
      `${plural(entry.items_removed, 'item')} and ${plural(entry.recipes_removed, 'recipe')} removed`,
  ].filter(Boolean)
  return parts.join('; ') || 'No changes'
}

/**
 * Calling a long rest (plan §4): every active character gets new visions from what they carry
 * now. The DM sees when the party last rested and how many characters it reached, and nothing
 * about any character's visions or inventory (C6).
 */
function LongRest({
  campaignId,
  userId,
  enabled,
  actions,
  onNotice,
}: {
  campaignId: string
  userId: string
  enabled: boolean
  actions: CraftingActions
  onNotice: (message: string) => void
}) {
  const last = useQuery(lastRestOptions(campaignId, userId, enabled))
  const [asking, setAsking] = useState(false)

  async function call() {
    const result = await actions.callRest(campaignId)
    if (result) {
      onNotice(describeRest(result))
      setAsking(false)
    }
  }

  return (
    <section aria-labelledby="visions-long-rest" className="crafting-rest">
      <h3 className="journal-section-title" id="visions-long-rest">
        Long rest
      </h3>
      <p className="crafting-hint">
        {last.isSuccess &&
          (last.data
            ? `The party last rested ${formatRestTime(last.data.called_at)}, reaching ${plural(last.data.character_count, 'character')}.`
            : 'The party has not rested yet.')}
        {last.isError && 'The last rest could not be read.'}
        {last.isPending && 'Checking the last rest…'}
      </p>
      {!asking ? (
        <button
          className="journal-button"
          disabled={actions.isPending}
          onClick={() => {
            actions.clearError()
            setAsking(true)
          }}
          type="button"
        >
          Call a long rest
        </button>
      ) : (
        <div className="journal-alert crafting-confirm" role="group" aria-label="Confirm long rest">
          <p>
            <strong>Call a long rest?</strong> Every active character receives new visions from the
            materials they carry now, and every player is told at once. You won’t see what anyone
            receives. A rest can’t be called again for 30 seconds.
          </p>
          <div className="journal-actions">
            <button
              aria-busy={actions.isPending || undefined}
              className="journal-button"
              disabled={actions.isPending}
              onClick={() => void call()}
              type="button"
            >
              {actions.isPending ? 'Resting…' : 'Call the rest'}
            </button>
            <button
              className="journal-button journal-button--ghost"
              disabled={actions.isPending}
              onClick={() => setAsking(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function ImportHistory({ libraryId, userId }: { libraryId: string; userId: string }) {
  const history = useQuery(libraryImportsOptions(libraryId, userId))
  if (history.isPending) {
    return (
      <p className="journal-status" role="status">
        Loading the imports…
      </p>
    )
  }
  if (history.isError) {
    return (
      <div className="journal-status journal-status--error" role="alert">
        <p>The imports could not be loaded.</p>
        <button
          className="journal-button journal-button--secondary"
          onClick={() => void history.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }
  if (history.data.length === 0) {
    return <p className="crafting-hint">Nothing has been imported yet.</p>
  }
  return (
    <ul className="crafting-history">
      {history.data.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.pack_name}</strong>
          {entry.source_label && <span> ({entry.source_label})</span>}
          <span className="crafting-hint">
            {' '}
            {new Date(entry.imported_at).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            : {describePackImport(entry)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The create form: a name, and an optional description. */
function LibraryForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; description: string }
  submitLabel: string
  pending: boolean
  onSubmit: (name: string, description: string) => Promise<boolean>
  onCancel?: () => void
}) {
  const nameId = useId()
  const descriptionId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [touched, setTouched] = useState(false)
  const trimmed = name.trim()
  // eslint-disable-next-line no-control-regex
  const nameError = /[\u0000-\u001f\u007f-\u009f]/.test(trimmed)
    ? 'That name has characters that can’t be kept.'
    : trimmed === ''
      ? 'Give the library a name.'
      : trimmed.length > craftingLimits.libraryName
        ? `Use a name of up to ${craftingLimits.libraryName} characters.`
        : null
  const descriptionError =
    description.trim().length > craftingLimits.libraryDescription
      ? `Use a description of up to ${craftingLimits.libraryDescription.toLocaleString('en-US')} characters.`
      : null

  return (
    <form
      className="crafting-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (nameError || descriptionError || pending) return
        void onSubmit(trimmed, description).then((saved) => {
          if (saved && !initial) {
            setName('')
            setDescription('')
            setTouched(false)
          }
        })
      }}
    >
      <div className="journal-field">
        <label htmlFor={nameId}>Library name</label>
        <input
          aria-describedby={touched && nameError ? `${nameId}-error` : undefined}
          aria-invalid={touched && nameError ? 'true' : undefined}
          autoComplete="off"
          className="journal-input"
          disabled={pending}
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder="For example, Drakkenheim crafting"
          value={name}
        />
        {touched && nameError && (
          <p className="journal-error" id={`${nameId}-error`}>
            {nameError}
          </p>
        )}
      </div>
      <div className="journal-field">
        <label htmlFor={descriptionId}>
          Description <span>(optional)</span>
        </label>
        <textarea
          aria-describedby={descriptionError ? `${descriptionId}-error` : undefined}
          aria-invalid={descriptionError ? 'true' : undefined}
          className="journal-input"
          disabled={pending}
          id={descriptionId}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          value={description}
        />
        {descriptionError && (
          <p className="journal-error" id={`${descriptionId}-error`}>
            {descriptionError}
          </p>
        )}
      </div>
      <div className="journal-actions">
        <button
          aria-busy={pending || undefined}
          className="journal-button"
          disabled={pending}
          type="submit"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            className="journal-button journal-button--ghost"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

type Screen = { type: 'list' } | { type: 'browse'; libraryId: string }

/**
 * The DM's side of the Maker's Visions (M04 plan §6.1): the libraries they own, which of them
 * this campaign uses, importing packs, and browsing a whole library. Only the campaign owner
 * sees it. A library's items and recipes are never shown to players.
 */
export function VisionsDm({
  campaignId,
  userId,
  enabled,
  onNotice,
}: {
  campaignId: string
  userId: string
  /** Loads once the area is first opened. */
  enabled: boolean
  onNotice: (message: string) => void
}) {
  const libraries = useQuery(librariesOptions(userId, enabled))
  const links = useQuery(campaignLibrariesOptions(campaignId, userId, enabled))
  const actions = useCraftingActions(userId)
  const [screen, setScreen] = useState<Screen>({ type: 'list' })
  const [importing, setImporting] = useState<CraftingLibrary | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [historyFor, setHistoryFor] = useState<ReadonlySet<string>>(new Set())
  const [deleting, setDeleting] = useState<{
    library: CraftingLibrary
    preview: LibraryDeletePreview
  } | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const owned = libraries.data ?? []
  const enabledIds = new Set((links.data ?? []).map((link) => link.library_id))
  const ownedIds = new Set(owned.map((library) => library.id))
  const foreign = (links.data ?? []).filter((link) => !ownedIds.has(link.library_id))
  const pending = actions.isPending
  const status =
    libraries.isError || links.isError
      ? 'error'
      : libraries.isSuccess && links.isSuccess
        ? 'success'
        : 'pending'

  if (screen.type === 'browse') {
    const library = owned.find((entry) => entry.id === screen.libraryId)
    if (library) {
      return (
        <LibraryBrowser
          library={library}
          onBack={() => setScreen({ type: 'list' })}
          userId={userId}
        />
      )
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(craftingPackPrompt())
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  async function askDelete(library: CraftingLibrary) {
    actions.clearError()
    try {
      setDeleting({ library, preview: await previewLibraryDelete(library.id) })
    } catch {
      // Nothing was deleted; the list shows the library still, and a retry is one click away.
      setDeleting(null)
      onNotice('That library couldn’t be checked. Try again.')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    const done = await actions.remove(deleting.library.id, campaignId)
    if (done) {
      onNotice(`Deleted ${deleting.library.name}`)
      setDeleting(null)
    }
  }

  return (
    <div className="visions-dm">
      <p className="crafting-lede">
        Your libraries hold the items and recipes you bring in from books and notes. Turn one on for
        this campaign and, after each long rest, every character sees the recipes they hold key
        materials for. Players never see a library itself.
      </p>

      {actions.error && (
        <p className="journal-alert" role="alert">
          {actions.error}
        </p>
      )}

      <LongRest
        actions={actions}
        campaignId={campaignId}
        enabled={enabled}
        onNotice={onNotice}
        userId={userId}
      />

      {status === 'pending' && (
        <p className="journal-status" role="status">
          Loading your libraries…
        </p>
      )}
      {status === 'error' && (
        <div className="journal-status journal-status--error" role="alert">
          <p>Your libraries could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={() => {
              void libraries.refetch()
              void links.refetch()
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'success' && (
        <>
          {owned.length === 0 && (
            <p className="journal-status" role="status">
              Create a library and import a crafting pack to begin.
            </p>
          )}

          <ul className="crafting-libraries">
            {owned.map((library) => {
              const isOn = enabledIds.has(library.id)
              const onId = `library-${library.id}-on`
              return (
                <li className="crafting-library" key={library.id}>
                  {renaming === library.id ? (
                    <LibraryForm
                      initial={{ name: library.name, description: library.description ?? '' }}
                      onCancel={() => setRenaming(null)}
                      onSubmit={async (name, description) => {
                        const updated = await actions.rename(library, name, description)
                        if (updated) setRenaming(null)
                        return Boolean(updated)
                      }}
                      pending={pending}
                      submitLabel="Save"
                    />
                  ) : (
                    <>
                      <div className="crafting-library__head">
                        <h3 className="journal-section-title">
                          <PixelIcon name="book" />
                          {library.name}
                        </h3>
                        <div className="journal-check">
                          <input
                            checked={isOn}
                            disabled={pending}
                            id={onId}
                            onChange={(event) =>
                              void actions.setEnabled(campaignId, library.id, event.target.checked)
                            }
                            type="checkbox"
                          />
                          <label htmlFor={onId}>Use in this campaign</label>
                        </div>
                      </div>
                      {library.description && (
                        <p className="crafting-text">{library.description}</p>
                      )}
                      <div className="journal-actions">
                        <button
                          className="journal-button"
                          disabled={pending}
                          onClick={() => setImporting(library)}
                          type="button"
                        >
                          Import pack
                        </button>
                        <button
                          className="journal-button journal-button--secondary"
                          onClick={() => setScreen({ type: 'browse', libraryId: library.id })}
                          type="button"
                        >
                          Browse
                        </button>
                        <button
                          className="journal-button journal-button--ghost"
                          disabled={pending}
                          onClick={() => {
                            actions.clearError()
                            setRenaming(library.id)
                          }}
                          type="button"
                        >
                          Rename
                        </button>
                        <button
                          className="journal-button journal-button--danger"
                          disabled={pending}
                          onClick={() => void askDelete(library)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                      <details
                        onToggle={(event) => {
                          const open = event.currentTarget.open
                          setHistoryFor((current) => {
                            const next = new Set(current)
                            if (open) next.add(library.id)
                            else next.delete(library.id)
                            return next
                          })
                        }}
                      >
                        <summary>Recent imports</summary>
                        {historyFor.has(library.id) && (
                          <ImportHistory libraryId={library.id} userId={userId} />
                        )}
                      </details>
                      {deleting?.library.id === library.id && (
                        <div className="journal-alert crafting-confirm" role="alert">
                          <p>
                            <strong>Delete {library.name}?</strong> Its items, recipes, and import
                            history are deleted for good.
                            {deleting.preview.campaigns > 0 &&
                              ` It is on in ${plural(deleting.preview.campaigns, 'campaign')}, where its visions stop appearing.`}
                            {deleting.preview.saved > 0 &&
                              ` ${plural(deleting.preview.saved, 'saved vision')} will be lost.`}
                            {deleting.preview.linked_items > 0 &&
                              ` ${plural(deleting.preview.linked_items, 'inventory item')} will stop being linked (the items stay).`}{' '}
                            This can’t be undone.
                          </p>
                          <div className="journal-actions">
                            <button
                              aria-busy={pending || undefined}
                              className="journal-button journal-button--solid-danger"
                              disabled={pending}
                              onClick={() => void confirmDelete()}
                              type="button"
                            >
                              {pending ? 'Deleting…' : 'Delete library'}
                            </button>
                            <button
                              className="journal-button journal-button--ghost"
                              disabled={pending}
                              onClick={() => setDeleting(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>

          {foreign.length > 0 && (
            <section aria-labelledby="visions-previous-dm">
              <h3 className="journal-section-title" id="visions-previous-dm">
                Enabled by a previous DM
              </h3>
              <p className="crafting-hint">
                These libraries belong to someone else and stay on so players keep their visions.
                You can turn them off, but not browse or change them.
              </p>
              <ul className="crafting-libraries">
                {foreign.map((link, position) => (
                  <li className="crafting-library crafting-library--foreign" key={link.library_id}>
                    <span>Library {position + 1}</span>
                    <button
                      className="journal-button journal-button--secondary"
                      disabled={pending}
                      onClick={() => void actions.setEnabled(campaignId, link.library_id, false)}
                      type="button"
                    >
                      Turn off
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="visions-new-library">
            <h3 className="journal-section-title" id="visions-new-library">
              New library
            </h3>
            <LibraryForm
              onSubmit={async (name, description) => {
                const created = await actions.create(name, description)
                if (created) onNotice(`Created ${created.name}`)
                return Boolean(created)
              }}
              pending={pending}
              submitLabel="Create library"
            />
          </section>

          <div className="crafting-prompt">
            <button
              className="journal-button journal-button--secondary"
              onClick={() => void copyPrompt()}
              type="button"
            >
              Copy pack prompt
            </button>
            <span className="handoff-dialog__copied" role="status">
              {copyState === 'copied' && 'Copied'}
              {copyState === 'failed' && 'Couldn’t copy the prompt.'}
            </span>
            <p className="crafting-hint">
              Give the prompt to a writing assistant with your book pages or notes. It returns a
              pack you import into a library. The app sends nothing anywhere.
            </p>
          </div>
        </>
      )}

      {importing && (
        <PackImportDialog
          actions={actions}
          library={importing}
          onClose={() => setImporting(null)}
          onImported={(result) => {
            onNotice(describeImport(result, importing.name))
            setImporting(null)
          }}
          userId={userId}
        />
      )}
    </div>
  )
}
