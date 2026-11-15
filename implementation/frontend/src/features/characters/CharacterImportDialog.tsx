import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  parseCharacterDocument,
  toImportPayload,
  type CharacterDocumentResult,
  type DocumentIssue,
  type ImportedCharacter,
} from './characterDocument'
import { abilityLabels, skillLabels } from './characterSheetRules'
import { conversionPrompt } from './characterPrompts'
import { abilityKeys, type SkillKey } from './characterTypes'
import { maxDocumentBytes } from './importText'
import { useCharacterImport } from './useCharacterImport'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'

const labelLimit = 120
// eslint-disable-next-line no-control-regex
const labelControls = /[\u0000-\u001f\u007f-\u009f]/

type Props = {
  campaignId: string
  userId: string
  /** Closes the dialog without importing. */
  onClose: () => void
  /** Called with the new character's id after a successful import. */
  onImported: (characterId: string) => void
}

/** Paste or upload a version-3 document, review every section, then create the character. */
export function CharacterImportDialog({ campaignId, userId, onClose, onImported }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const textId = useId()
  const labelId = useId()
  const fileId = useId()
  const importer = useCharacterImport(campaignId, userId)
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirmClose, setConfirmClose] = useState(false)

  const prompt = useMemo(() => conversionPrompt(), [])
  const result = useMemo<CharacterDocumentResult | null>(
    () => (text.trim() === '' ? null : parseCharacterDocument(text)),
    [text],
  )
  const trimmedLabel = label.trim()
  const labelError =
    trimmedLabel.length > labelLimit || labelControls.test(trimmedLabel)
      ? 'Use a source label of up to 120 characters.'
      : null
  const pending = importer.isPending
  const ready = result?.kind === 'parsed' && result.valid && !labelError

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])
  useEffect(() => headingRef.current?.focus(), [])

  function requestClose() {
    if (pending) return
    if (text.trim() !== '') setConfirmClose(true)
    else onClose()
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    setFileError(null)
    importer.clearError()
    if (file.size >= maxDocumentBytes) {
      setFileError('This file is too large. Use a document under 1 MB.')
      return
    }
    try {
      setText(await file.text())
      setLabel(file.name.slice(0, labelLimit))
    } catch {
      setFileError('That file could not be read. Paste its text instead.')
    }
  }

  async function submit() {
    if (!ready || result?.kind !== 'parsed' || pending) return
    const id = await importer.importNew(toImportPayload(result.character), trimmedLabel || null)
    if (id) onImported(id)
  }

  return (
    <>
      <dialog
        aria-labelledby={titleId}
        className="journal-prompt import-dialog"
        onCancel={(event) => {
          event.preventDefault()
          requestClose()
        }}
        ref={ref}
      >
        <h3 id={titleId} ref={headingRef} tabIndex={-1}>
          Import a character
        </h3>
        <p className="import-dialog__lede">
          Bring in a character you already wrote down. Nothing is saved until you review it and
          create the character.
        </p>

        <details className="import-dialog__prompt">
          <summary>How do I make a document?</summary>
          <p>
            Copy this prompt, give it and your character sheet to a writing assistant, and paste the
            JSON it returns below. The app never sends your sheet anywhere.
          </p>
          <div className="import-dialog__prompt-actions">
            <button
              className="journal-button journal-button--secondary"
              onClick={() => void copyPrompt()}
              type="button"
            >
              Copy conversion prompt
            </button>
            <span className="import-dialog__copied" role="status">
              {copyState === 'copied' && 'Copied'}
              {copyState === 'failed' && 'Couldn’t copy. Select the prompt below and copy it.'}
            </span>
          </div>
          <label className="import-dialog__sr" htmlFor={`${textId}-prompt`}>
            Conversion prompt
          </label>
          <textarea
            className="journal-input import-dialog__prompt-text"
            id={`${textId}-prompt`}
            readOnly
            rows={6}
            value={prompt}
          />
        </details>

        <div className="journal-field">
          <label htmlFor={textId}>Character document (JSON)</label>
          <textarea
            aria-describedby={`${textId}-hint`}
            className="journal-input import-dialog__text"
            disabled={pending}
            id={textId}
            onChange={(event) => {
              setText(event.target.value)
              importer.clearError()
            }}
            placeholder='{ "format": "the-goobers-guide-character", "version": 3, … }'
            rows={7}
            spellCheck={false}
            value={text}
          />
          <p className="import-dialog__hint" id={`${textId}-hint`}>
            Paste the document or choose a file under 1 MB.
          </p>
        </div>

        <div className="import-dialog__row">
          <div className="journal-field">
            <label htmlFor={fileId}>Or upload a file</label>
            <input
              accept=".json,.txt,.md,application/json,text/plain"
              className="journal-input"
              disabled={pending}
              id={fileId}
              onChange={(event) => {
                void readFile(event.target.files?.[0])
                event.target.value = ''
              }}
              type="file"
            />
            {fileError && (
              <p className="journal-error" role="alert">
                {fileError}
              </p>
            )}
          </div>
          <div className="journal-field">
            <label htmlFor={labelId}>
              Source <span>(optional)</span>
            </label>
            <input
              aria-describedby={labelError ? `${labelId}-error` : undefined}
              aria-invalid={labelError ? 'true' : undefined}
              autoComplete="off"
              className="journal-input"
              disabled={pending}
              id={labelId}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="For example, the file name"
              value={label}
            />
            {labelError && (
              <p className="journal-error" id={`${labelId}-error`}>
                {labelError}
              </p>
            )}
          </div>
        </div>

        {result?.kind === 'rejected' && (
          <p className="journal-alert" role="alert">
            {result.message}
          </p>
        )}
        {result?.kind === 'parsed' && <ImportReview result={result} />}

        {importer.error && (
          <p className="journal-alert" role="alert">
            {importer.error}
          </p>
        )}

        <div className="journal-prompt__actions import-dialog__actions">
          <button
            aria-busy={pending || undefined}
            className="journal-button"
            disabled={!ready || pending}
            onClick={() => void submit()}
            type="button"
          >
            {pending ? 'Creating…' : 'Create character'}
          </button>
          <button
            className="journal-button journal-button--secondary"
            disabled={pending}
            onClick={requestClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </dialog>

      {confirmClose && (
        <UnsavedChangesDialog
          discardLabel="Discard import"
          message="You pasted a document that hasn't been imported. Closing now will discard it."
          onDiscard={onClose}
          onKeep={() => setConfirmClose(false)}
          title="Discard this import?"
        />
      )}
    </>
  )
}

const sections = [
  ['character', 'Character'],
  ['vitals', 'Vitals'],
  ['abilities', 'Abilities'],
  ['saving_throws', 'Saving throws'],
  ['skills', 'Skills'],
  ['attacks', 'Attacks'],
  ['inventory', 'Inventory'],
  ['currency', 'Coins'],
  ['text', 'Features, spells, and notes'],
] as const

type SectionKey = (typeof sections)[number][0]

const detailFields = new Set(['name', 'species', 'class_name', 'subclass', 'background', 'level'])

/** Which review section a document path belongs to. */
function sectionOf(path: string): SectionKey | null {
  const field = path.replace(/^character\.?/, '').split(/[.[]/)[0]
  if (field === '') return null
  if (detailFields.has(field)) return 'character'
  if (field === 'vitals' || field === 'abilities' || field === 'saving_throws') return field
  if (field === 'skills' || field === 'attacks' || field === 'inventory') return field
  if (field === 'currency') return 'currency'
  return 'text'
}

const maxListed = 20

function ImportReview({
  result,
}: {
  result: Extract<CharacterDocumentResult, { kind: 'parsed' }>
}) {
  const { character, issues, ignored, valid } = result
  const bySection = new Map<SectionKey | 'general', DocumentIssue[]>()
  for (const issue of issues) {
    const key = sectionOf(issue.path) ?? 'general'
    bySection.set(key, [...(bySection.get(key) ?? []), issue])
  }
  const general = bySection.get('general') ?? []

  return (
    <section aria-label="Review" className="import-review">
      <p
        className={valid ? 'import-review__summary' : 'journal-alert'}
        role={valid ? 'status' : 'alert'}
      >
        {valid
          ? 'Everything checks out. Review the character below, then create it.'
          : `${issues.length} ${issues.length === 1 ? 'problem needs' : 'problems need'} fixing in the document before you can import it.`}
      </p>
      {general.length > 0 && <IssueList issues={general} />}
      {sections.map(([key, title]) => {
        const found = bySection.get(key) ?? []
        return (
          <section
            aria-labelledby={`import-review-${key}`}
            className="import-review__section"
            data-invalid={found.length > 0 || undefined}
            key={key}
          >
            <h4 id={`import-review-${key}`}>
              {title}
              {found.length > 0 && (
                <span className="import-review__badge">
                  {found.length} {found.length === 1 ? 'problem' : 'problems'}
                </span>
              )}
            </h4>
            <SectionBody character={character} section={key} />
            {found.length > 0 && <IssueList issues={found} />}
          </section>
        )
      })}
      {ignored.length > 0 && (
        <details className="import-review__ignored">
          <summary>Not imported ({ignored.length})</summary>
          <p>
            These fields are managed by the app or aren’t part of the format, so they were left out.
          </p>
          <ul>
            {ignored.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function IssueList({ issues }: { issues: DocumentIssue[] }) {
  return (
    <ul className="import-review__issues">
      {issues.map((issue, index) => (
        <li key={`${issue.path}:${index}`}>
          <code>{issue.path}</code> {issue.message}
        </li>
      ))}
    </ul>
  )
}

const show = (value: string | number | null) => (value === null || value === '' ? '—' : value)

function SectionBody({
  character,
  section,
}: {
  character: ImportedCharacter
  section: SectionKey
}) {
  const { details, vitals, body, items, coins } = character
  switch (section) {
    case 'character':
      return (
        <dl className="import-review__facts">
          <Fact label="Name" value={details.name} />
          <Fact label="Species" value={details.species} />
          <Fact label="Class" value={details.class_name} />
          <Fact label="Subclass" value={details.subclass} />
          <Fact label="Background" value={details.background} />
          <Fact label="Level" value={details.level} />
        </dl>
      )
    case 'vitals':
      return (
        <dl className="import-review__facts">
          <Fact label="Maximum HP" value={vitals.max_hp} />
          <Fact label="Current HP" value={vitals.current_hp} />
          <Fact label="Temporary HP" value={vitals.temp_hp} />
          <Fact label="Armor class" value={vitals.armor_class} />
          <Fact label="Speed" value={vitals.speed} />
        </dl>
      )
    case 'abilities':
      return (
        <dl className="import-review__facts">
          {abilityKeys.map((key) => (
            <Fact key={key} label={abilityLabels[key]} value={body.abilities[key]} />
          ))}
        </dl>
      )
    case 'saving_throws':
      return (
        <p>
          {body.saving_throws.length === 0
            ? 'None'
            : body.saving_throws.map((key) => abilityLabels[key]).join(', ')}
        </p>
      )
    case 'skills': {
      const skills = Object.entries(body.skills) as [SkillKey, string][]
      return skills.length === 0 ? (
        <p>None</p>
      ) : (
        <ul className="import-review__list">
          {skills.map(([key, level]) => (
            <li key={key}>
              {skillLabels[key]} <small>({level})</small>
            </li>
          ))}
        </ul>
      )
    }
    case 'attacks':
      return body.attacks.length === 0 ? (
        <p>None</p>
      ) : (
        <ul className="import-review__list">
          {body.attacks.map((attack) => (
            <li key={attack.id}>
              <strong>{attack.name || 'Unnamed attack'}</strong>{' '}
              <small>
                {[attack.bonus, attack.damage, attack.notes].filter(Boolean).join(' · ')}
              </small>
            </li>
          ))}
        </ul>
      )
    case 'inventory':
      return items.length === 0 ? (
        <p>None</p>
      ) : (
        <>
          <ul className="import-review__list">
            {items.slice(0, maxListed).map((item, index) => (
              <li key={`${item.name}:${index}`}>
                <strong>{item.name}</strong> × {item.quantity}
                {item.equipped && <small> · equipped</small>}
                {item.attuned && <small> · attuned</small>}
              </li>
            ))}
          </ul>
          {items.length > maxListed && <p>…and {items.length - maxListed} more.</p>}
        </>
      )
    case 'currency':
      return (
        <dl className="import-review__facts">
          <Fact label="Copper" value={coins.cp} />
          <Fact label="Silver" value={coins.sp} />
          <Fact label="Gold" value={coins.gp} />
        </dl>
      )
    case 'text':
      return (
        <dl className="import-review__facts import-review__facts--text">
          <Fact label="Alignment" value={body.alignment} />
          <Fact label="Experience" value={body.experience} />
          <Fact label="Features" value={excerpt(body.features)} />
          <Fact label="Spells" value={excerpt(body.spells)} />
          <Fact label="Notes" value={excerpt(body.notes)} />
        </dl>
      )
  }
}

function excerpt(text: string) {
  return text.length > 160
    ? `${text.slice(0, 157)}… (${text.length.toLocaleString('en-US')} characters)`
    : text
}

function Fact({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{show(value)}</dd>
    </div>
  )
}
