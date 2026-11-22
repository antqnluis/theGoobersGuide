import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { PixelIcon } from '../characters/PixelIcon'
import { adventuresPrefix, handoffsOptions } from './adventureQueries'
import { updateAuthorLabel } from './adventureRules'
import { appliedSummary } from './handoffRules'
import { deleteHandoff, handoffError, type HandoffRecord } from './handoffService'
import type { CampaignRosterMember } from '../campaigns/campaignTypes'

type Roster = readonly Pick<CampaignRosterMember, 'profile_id' | 'username' | 'display_name'>[]

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * The adventure's kept handoff sources (M03.9 H14). Each is shown as plain text, never as
 * Markdown or HTML, and starts collapsed. Whoever can read the adventure reads its sources; only
 * the person who brought a source in may delete it, while the adventure can still be edited.
 */
export function AdventureSources({
  adventureId,
  editable,
  headingRef,
  roster,
  userId,
}: {
  adventureId: string
  /** Whether the viewer may change the adventure now (not archived, not a party reader). */
  editable: boolean
  headingRef?: React.Ref<HTMLHeadingElement>
  roster: Roster
  userId: string
}) {
  const base = useId()
  const queryClient = useQueryClient()
  const query = useQuery(handoffsOptions(adventureId, userId))
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const removal = useMutation({
    mutationFn: (id: string) => deleteHandoff(id),
  })

  async function remove(id: string) {
    setError(null)
    try {
      await removal.mutateAsync(id)
      setConfirming(null)
      // The objectives and updates it created lose their label, so the detail refreshes too.
      await queryClient.invalidateQueries({ queryKey: adventuresPrefix })
    } catch (failure) {
      setConfirming(null)
      setError(
        handoffError(
          failure,
          "We couldn't delete this source. Check your connection and try again.",
        ),
      )
      void queryClient.invalidateQueries({ queryKey: adventuresPrefix })
    }
  }

  async function copy(record: HandoffRecord) {
    try {
      await navigator.clipboard.writeText(record.source_text)
      setCopied({ id: record.id, ok: true })
    } catch {
      setCopied({ id: record.id, ok: false })
    }
  }

  function toggle(id: string) {
    setOpen((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section aria-labelledby={`${base}-heading`} className="adventure-block adventure-sources">
      <h4 className="journal-section-title" id={`${base}-heading`} ref={headingRef} tabIndex={-1}>
        <PixelIcon name="book" />
        Sources
      </h4>

      {error && (
        <p className="journal-alert" role="alert">
          {error}
        </p>
      )}
      {query.isPending && (
        <p className="journal-status" role="status">
          Loading sources…
        </p>
      )}
      {query.isError && (
        <div className="journal-status journal-status--error" role="alert">
          <p>The sources could not be loaded.</p>
          <button
            className="journal-button journal-button--secondary"
            onClick={() => void query.refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      )}
      {query.isSuccess && query.data.length === 0 && (
        <p className="adventure-block__empty">No handoffs yet.</p>
      )}
      {query.isSuccess && query.data.length > 0 && (
        <ul className="source-list">
          {query.data.map((record) => {
            const expanded = open.has(record.id)
            const mine = record.imported_by === userId
            const name = record.source_label ?? 'Pasted text'
            return (
              <li className="source-row" key={record.id}>
                <p className="source-row__title">
                  <strong>{name}</strong>
                  <small>
                    {record.kind === 'new' ? 'Started this adventure' : 'Attached'}
                    {' · '}
                    {updateAuthorLabel(record.imported_by, userId, roster)}
                    {' · '}
                    <time dateTime={record.imported_at}>
                      {dateFormat.format(new Date(record.imported_at))}
                    </time>
                  </small>
                </p>
                <p className="source-row__summary">{appliedSummary(record)}</p>
                <div className="source-row__tools">
                  <button
                    aria-controls={`${base}-${record.id}`}
                    aria-expanded={expanded}
                    className="journal-button journal-button--ghost"
                    onClick={() => toggle(record.id)}
                    type="button"
                  >
                    {expanded ? 'Hide source' : 'Show source'}
                  </button>
                  <button
                    aria-label={`Copy source ${name}`}
                    className="journal-button journal-button--ghost"
                    onClick={() => void copy(record)}
                    type="button"
                  >
                    Copy source
                  </button>
                  {editable && mine && confirming !== record.id && (
                    <button
                      aria-label={`Delete source ${name}`}
                      className="journal-button journal-button--danger"
                      disabled={removal.isPending}
                      onClick={() => setConfirming(record.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  )}
                  <span className="source-row__copied" role="status">
                    {copied?.id === record.id &&
                      (copied.ok ? 'Copied' : 'Couldn’t copy. Show the source and copy it.')}
                  </span>
                </div>
                {expanded && (
                  // A scrollable region must be reachable by keyboard. The text is plain.
                  <pre
                    aria-label={`Source text: ${name}`}
                    className="source-row__text"
                    id={`${base}-${record.id}`}
                    role="region"
                    tabIndex={0}
                  >
                    {record.source_text}
                  </pre>
                )}
                {confirming === record.id && (
                  <div
                    aria-label={`Confirm deleting ${name}`}
                    className="journal-confirm"
                    role="group"
                  >
                    <p>
                      Delete the source <strong>{name}</strong>? The changes it made stay, but they
                      lose their “From handoff” label.
                    </p>
                    <div className="journal-actions">
                      <button
                        autoFocus
                        className="journal-button journal-button--ghost"
                        disabled={removal.isPending}
                        onClick={() => setConfirming(null)}
                        type="button"
                      >
                        Keep source
                      </button>
                      <button
                        aria-busy={removal.isPending || undefined}
                        className="journal-button journal-button--solid-danger"
                        disabled={removal.isPending}
                        onClick={() => void remove(record.id)}
                        type="button"
                      >
                        {removal.isPending ? 'Deleting…' : 'Yes, delete'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
