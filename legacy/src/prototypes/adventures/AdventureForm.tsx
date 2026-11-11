import { useState, type FormEvent } from 'react';
import { blankDraft, statuses, type AdventureDraft } from './model';

export default function AdventureForm({
  initial,
  creating,
  error,
  onSave,
  onCancel,
  onDirty,
}: {
  initial?: AdventureDraft;
  creating: boolean;
  error: string | null;
  onSave: (draft: AdventureDraft) => void;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<AdventureDraft>(() =>
    initial
      ? {
          title: initial.title,
          type: initial.type,
          status: initial.status,
          description: initial.description,
          nextStep: initial.nextStep,
        }
      : blankDraft(),
  );
  const [expanded, setExpanded] = useState(!creating);
  function change<K extends keyof AdventureDraft>(
    key: K,
    value: AdventureDraft[K],
  ) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    const baseline = initial ?? blankDraft();
    onDirty(
      (Object.keys(next) as (keyof AdventureDraft)[]).some(
        (field) => next[field] !== baseline[field],
      ),
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(draft);
  }
  return (
    <form className="ap-form" onSubmit={submit} noValidate>
      <label htmlFor="adventure-title">
        Title <span>(required)</span>
      </label>
      <input
        autoFocus
        id="adventure-title"
        value={draft.title}
        onChange={(event) => change('title', event.target.value)}
        aria-invalid={Boolean(error) && !draft.title.trim()}
        aria-describedby={error ? 'adventure-error' : undefined}
        placeholder="What do you want to follow up on?"
      />
      {creating && (
        <p className="ap-muted">
          A title is enough. You can add the details later.
        </p>
      )}
      {creating && (
        <button
          type="button"
          className="ap-text-button"
          aria-expanded={expanded}
          aria-controls="adventure-options"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide optional details' : 'Add optional details'}
        </button>
      )}
      {expanded && (
        <div id="adventure-options" className="ap-fields">
          <label>
            Type
            <select
              value={draft.type}
              onChange={(event) =>
                change('type', event.target.value as AdventureDraft['type'])
              }
            >
              <option>Personal</option>
              <option>Side</option>
            </select>
          </label>
          <label>
            Player-tracked status
            <select
              value={draft.status}
              onChange={(event) =>
                change('status', event.target.value as AdventureDraft['status'])
              }
            >
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="ap-full">
            Next step
            <textarea
              rows={2}
              value={draft.nextStep}
              onChange={(event) => change('nextStep', event.target.value)}
            />
          </label>
          <label className="ap-full">
            Description
            <textarea
              rows={4}
              value={draft.description}
              onChange={(event) => change('description', event.target.value)}
            />
          </label>
        </div>
      )}
      {error && (
        <p id="adventure-error" className="ap-error" role="alert">
          {error}
        </p>
      )}
      <div className="ap-actions">
        <button className="ap-primary" type="submit">
          {creating ? 'Create adventure' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
