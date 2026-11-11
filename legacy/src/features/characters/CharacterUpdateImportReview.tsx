import { useEffect, useRef, useState } from 'react';
import {
  applyCharacterImportUpdate,
  type CharacterImportUpdate,
  type CharacterImportUpdateChange,
  parseCharacterUpdateImport,
} from './characterUpdateImport';
import { MAX_CHARACTER_IMPORT_BYTES } from './characterImport';
import { createCharacterUpdatePrompt } from './characterUpdatePrompt';
import type { Character } from './model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function displayValue(value: unknown): string {
  if (value === undefined) return 'Not recorded';
  if (typeof value === 'string') return value.trim() ? value : 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function detailLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (first) => first.toUpperCase());
}

function EntryDetails({ value }: { value: unknown }) {
  if (!isRecord(value)) return <p>{displayValue(value)}</p>;
  const fields = Object.entries(value).filter(([field]) => field !== 'id');
  if (fields.length === 0) return <p>Entry</p>;
  return (
    <dl className="character-update-entry-details">
      {fields.map(([field, fieldValue]) => (
        <div key={field}>
          <dt>{detailLabel(field)}</dt>
          <dd>
            {typeof fieldValue === 'number' &&
            ['modifier', 'attackBonus'].includes(field)
              ? signed(fieldValue)
              : displayValue(fieldValue)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ChangeValues({ change }: { change: CharacterImportUpdateChange }) {
  if (change.kind === 'collection') {
    const afterLabel =
      change.operation === 'remove' ? 'After removal' : 'After update';
    return (
      <div className="character-update-values">
        <div>
          <span>Current entry</span>
          <EntryDetails value={change.current} />
        </div>
        <div>
          <span>{afterLabel}</span>
          {change.operation === 'remove' ? (
            <strong>Removed</strong>
          ) : (
            <EntryDetails value={change.incoming} />
          )}
        </div>
      </div>
    );
  }

  const format = (value: unknown) => {
    if (change.kind === 'ability' && isRecord(value)) {
      const score = typeof value.score === 'number' ? value.score : '—';
      const modifier =
        typeof value.modifier === 'number' ? signed(value.modifier) : '—';
      return `${score} (${modifier})`;
    }
    return displayValue(value);
  };

  return (
    <div className="character-update-values">
      <div>
        <span>Current</span>
        <strong>{format(change.current)}</strong>
      </div>
      <div>
        <span>
          {change.incoming === undefined ? 'After clear' : 'After update'}
        </span>
        <strong>{format(change.incoming)}</strong>
      </div>
    </div>
  );
}

export default function CharacterUpdateImportReview({
  character,
  error,
  onApply,
  onCancel,
}: {
  character: Character;
  error: string | null;
  onApply: (updated: Character) => boolean;
  onCancel: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pastedJsonInput = useRef<HTMLTextAreaElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const wasReviewing = useRef(false);
  const [source, setSource] = useState('');
  const [sourceLabel, setSourceLabel] = useState('pasted update JSON');
  const [review, setReview] = useState<CharacterImportUpdate | null>(null);
  const [selectedChangeIds, setSelectedChangeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptStatus, setPromptStatus] = useState<string | null>(null);

  useEffect(() => {
    if (review) heading.current?.focus();
    else if (wasReviewing.current) pastedJsonInput.current?.focus();
    else heading.current?.focus();
    wasReviewing.current = Boolean(review);
  }, [review]);

  const characterSnapshot = JSON.stringify(character);
  const previousCharacterSnapshot = useRef(characterSnapshot);

  useEffect(() => {
    if (previousCharacterSnapshot.current === characterSnapshot) return;
    previousCharacterSnapshot.current = characterSnapshot;
    if (!review) return;
    try {
      setReview(parseCharacterUpdateImport(source, character));
      setSelectedChangeIds(new Set());
      setLocalError(
        'This character changed during review. The comparison has been refreshed; choose the changes to apply again.',
      );
    } catch (cause) {
      setReview(null);
      setSelectedChangeIds(new Set());
      setLocalError(
        cause instanceof Error
          ? cause.message
          : 'The character update could not be refreshed.',
      );
    }
  }, [character, characterSnapshot, review, source]);

  function startReview(nextSource: string, label: string) {
    setLocalError(null);
    try {
      setReview(parseCharacterUpdateImport(nextSource, character));
      setSelectedChangeIds(new Set());
      setSource(nextSource);
      setSourceLabel(label);
    } catch (cause) {
      setReview(null);
      setLocalError(
        cause instanceof Error
          ? cause.message
          : 'The character update could not be read.',
      );
    }
  }

  async function readFile(file: File) {
    setLocalError(null);
    if (file.size > MAX_CHARACTER_IMPORT_BYTES) {
      setLocalError('Choose a character update JSON file up to 1 MB.');
      return;
    }
    try {
      startReview(await file.text(), file.name);
    } catch {
      setLocalError('The update file could not be read.');
    }
  }

  async function copyUpdatePrompt() {
    const nextPrompt = createCharacterUpdatePrompt(character);
    setPromptText(nextPrompt);
    setPromptStatus(null);
    try {
      await navigator.clipboard.writeText(nextPrompt);
      setPromptStatus(
        'Update prompt copied. Paste it into your writing assistant, then bring its changes-only JSON back here.',
      );
    } catch {
      setPromptStatus(
        'Copying is unavailable here. The prompt is shown below so you can select and copy it.',
      );
      requestAnimationFrame(() => promptInput.current?.focus());
    }
  }

  function toggleChange(changeId: string) {
    setSelectedChangeIds((current) => {
      const next = new Set(current);
      if (next.has(changeId)) next.delete(changeId);
      else next.add(changeId);
      return next;
    });
  }

  function applySelectedChanges() {
    if (!review || selectedChangeIds.size === 0 || review.issues.length > 0)
      return;
    try {
      const updated = applyCharacterImportUpdate(
        character,
        review,
        selectedChangeIds,
      );
      onApply(updated);
    } catch (cause) {
      try {
        setReview(parseCharacterUpdateImport(source, character));
        setSelectedChangeIds(new Set());
        setLocalError(
          cause instanceof Error
            ? cause.message
            : 'The character changed during review. Review the updated values before applying.',
        );
      } catch (refreshCause) {
        setReview(null);
        setSelectedChangeIds(new Set());
        setLocalError(
          refreshCause instanceof Error
            ? refreshCause.message
            : 'The character update could not be refreshed.',
        );
      }
    }
  }

  const groupedChanges = new Map<string, CharacterImportUpdateChange[]>();
  for (const change of review?.changes ?? []) {
    const group = groupedChanges.get(change.group) ?? [];
    group.push(change);
    groupedChanges.set(change.group, group);
  }

  return (
    <section
      className="character-update-import"
      id="character-update-import"
      aria-labelledby="character-update-heading"
    >
      <div className="character-update-heading">
        <div>
          <h2 id="character-update-heading" ref={heading} tabIndex={-1}>
            {review ? `Review updates from ${sourceLabel}` : 'Import updates'}
          </h2>
          <p>
            {review
              ? 'Choose the changes to apply. Nothing is saved until you apply selected changes.'
              : `Create a changes-only update for ${character.name || 'this character'}, then review it here.`}
          </p>
        </div>
        <button
          className="button button-quiet"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      {!review && (
        <div className="character-update-prompt">
          <button
            className="button button-quiet"
            type="button"
            onClick={copyUpdatePrompt}
          >
            Copy update prompt
          </button>
          {promptStatus && <p role="status">{promptStatus}</p>}
          {promptText && (
            <label>
              Update prompt
              <textarea
                ref={promptInput}
                className="import-json-text"
                rows={12}
                readOnly
                value={promptText}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
        </div>
      )}

      {localError && (
        <p className="form-error" role="alert">
          {localError}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!review ? (
        <div className="import-options character-update-inputs">
          <div className="import-paste-option">
            <label htmlFor="character-update-json">
              Paste changes-only update JSON
            </label>
            <textarea
              ref={pastedJsonInput}
              id="character-update-json"
              className="import-json-text"
              rows={10}
              spellCheck={false}
              placeholder={`Paste JSON beginning with { "format": "the-goobers-guide-character-update", "version": 1 ... }`}
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setLocalError(null);
              }}
            />
            <button
              className="button button-primary"
              type="button"
              onClick={() => startReview(source, 'pasted update JSON')}
            >
              Review updates
            </button>
          </div>
          <div className="import-file-option">
            <div>
              <strong>Upload a file</strong>
              <span>Choose a .json update file up to 1 MB.</span>
            </div>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              Choose JSON file
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              aria-label="Choose character update JSON file"
              tabIndex={-1}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await readFile(file);
                event.target.value = '';
              }}
            />
          </div>
        </div>
      ) : (
        <>
          {review.issues.length > 0 && (
            <div className="character-update-issues" role="alert">
              <h3>Resolve these issues before applying updates</h3>
              <ul>
                {review.issues.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {review.changes.length === 0 ? (
            <p className="character-update-no-changes" role="status">
              No changes were found in this update.
            </p>
          ) : (
            <div className="character-update-diff">
              {[...groupedChanges.entries()].map(([group, changes]) => (
                <section
                  className="character-update-group"
                  key={group}
                  aria-labelledby={`character-update-group-${group.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
                >
                  <h3
                    id={`character-update-group-${group.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
                  >
                    {group}
                  </h3>
                  {changes.map((change) => {
                    const issue = review.changeIssues[change.id];
                    const issueId = `${change.id.replace(/[^a-z0-9]+/gi, '-')}-issue`;
                    return (
                      <article
                        className="character-update-change"
                        key={change.id}
                      >
                        <label className="character-update-change-label">
                          <input
                            type="checkbox"
                            checked={selectedChangeIds.has(change.id)}
                            disabled={Boolean(issue)}
                            aria-describedby={issue ? issueId : undefined}
                            onChange={() => toggleChange(change.id)}
                          />
                          <span>{change.label}</span>
                        </label>
                        <ChangeValues change={change} />
                        {issue && (
                          <p
                            className="character-update-change-issue"
                            id={issueId}
                          >
                            This change cannot be saved: {issue}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
          <div className="character-update-actions">
            <button
              className="button button-quiet"
              type="button"
              onClick={() => {
                setReview(null);
                setSelectedChangeIds(new Set());
                setLocalError(null);
              }}
            >
              Choose another update
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={
                selectedChangeIds.size === 0 || review.issues.length > 0
              }
              onClick={applySelectedChanges}
            >
              Apply selected updates ({selectedChangeIds.size})
            </button>
          </div>
        </>
      )}
    </section>
  );
}
