import { useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '../../shared/ui/useUnsavedChanges';
import type { Campaign } from '../campaigns/model';
import type { CampaignNote } from './model';
import { noteCategories, recentNotes, type NoteDetails } from './noteService';

interface Props {
  campaign: Campaign;
  notes: CampaignNote[];
  noteId: string | null;
  onSave(details: NoteDetails, noteId?: string): boolean;
  onDelete(note: CampaignNote): void;
  feedback: string | null;
  error: string | null;
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Date unavailable'
    : parsed.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

export default function CampaignJournal({
  campaign,
  notes,
  noteId,
  onSave,
  onDelete,
  feedback,
  error,
}: Props) {
  const selected = notes.find((note) => note.id === noteId);
  const creating = noteId === 'new';
  const [editing, setEditing] = useState(creating);
  const [draft, setDraft] = useState<NoteDetails>({
    title: selected?.title ?? '',
    content: selected?.content ?? '',
    category: selected?.category ?? 'General',
  });
  const [original, setOriginal] = useState<NoteDetails>({
    title: selected?.title ?? '',
    content: selected?.content ?? '',
    category: selected?.category ?? 'General',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const allowNavigation = useUnsavedChanges(
    editing && JSON.stringify(draft) !== JSON.stringify(original),
    'Discard unsaved note changes?',
  );
  const base = `#/notes/${campaign.id}`;
  const ordered = recentNotes(notes, notes.length);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.content.trim()) {
      setFormError('Enter a title and note content.');
      return;
    }
    allowNavigation.current = true;
    if (onSave(draft, selected?.id)) {
      setEditing(false);
      setFormError(null);
      if (!creating) allowNavigation.current = false;
    } else {
      allowNavigation.current = false;
    }
  }

  return (
    <div className="preview-page journal-page">
      <div className="page-heading library-heading">
        <div>
          <p className="page-context">{campaign.name}</p>
          <h1>Campaign notes</h1>
          <p>
            Record what your party has learned and return to it during play.
          </p>
        </div>
        <a className="button button-primary" href={`${base}/new`}>
          Create note
        </a>
      </div>
      {feedback && (
        <p className="form-feedback" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="journal-layout">
        <nav className="journal-index" aria-label="Campaign notes">
          <div className="section-heading">
            <h2>Journal entries</h2>
          </div>
          {ordered.length ? (
            ordered.map((note) => (
              <a
                className={`journal-entry ${note.id === noteId ? 'journal-entry-active' : ''}`}
                href={`${base}/${note.id}`}
                key={note.id}
                aria-current={note.id === noteId ? 'page' : undefined}
              >
                <span className="journal-category">
                  {note.category || 'General'}
                </span>
                <strong>{note.title}</strong>
                <span className="journal-excerpt">{note.content}</span>
                <time dateTime={note.updatedAt}>
                  Updated {date(note.updatedAt)}
                </time>
              </a>
            ))
          ) : (
            <div className="journal-empty">
              <p>No notes in this campaign yet.</p>
              <a href={`${base}/new`}>Create the first note</a>
            </div>
          )}
        </nav>
        <section className="journal-paper" aria-label="Selected note">
          {editing && (creating || selected) ? (
            <form onSubmit={submit} className="journal-form">
              <h2>{creating ? 'New note' : 'Edit note'}</h2>
              <label>
                Title
                <input
                  className="field-input"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Category
                <select
                  className="field-input"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                >
                  {noteCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                  {draft.category &&
                    !noteCategories.some(
                      (category) => category === draft.category,
                    ) && <option>{draft.category}</option>}
                </select>
              </label>
              <label>
                Note content
                <textarea
                  className="field-input"
                  rows={13}
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                  required
                />
              </label>
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="journal-actions">
                <button className="button button-primary" type="submit">
                  Save note
                </button>
                {creating ? (
                  <a
                    className="button button-quiet"
                    href={base}
                    onClick={() => {
                      allowNavigation.current = true;
                    }}
                  >
                    Cancel
                  </a>
                ) : (
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setFormError(null);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : selected ? (
            <article>
              <span className="journal-category">
                {selected.category || 'General'}
              </span>
              <h2>{selected.title}</h2>
              <div className="journal-dates">
                <span>
                  Created{' '}
                  <time dateTime={selected.createdAt}>
                    {date(selected.createdAt)}
                  </time>
                </span>
                <span>
                  Updated{' '}
                  <time dateTime={selected.updatedAt}>
                    {date(selected.updatedAt)}
                  </time>
                </span>
              </div>
              <div className="journal-content">{selected.content}</div>
              <div className="journal-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => {
                    setDraft({
                      title: selected.title,
                      content: selected.content,
                      category: selected.category ?? 'General',
                    });
                    setOriginal({
                      title: selected.title,
                      content: selected.content,
                      category: selected.category ?? 'General',
                    });
                    setEditing(true);
                  }}
                >
                  Edit note
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => onDelete(selected)}
                >
                  Delete note
                </button>
              </div>
            </article>
          ) : (
            <div className="journal-empty">
              <h2>{noteId ? 'Note not found' : 'Choose a note'}</h2>
              <p>
                {noteId
                  ? 'This note is not in the selected campaign.'
                  : 'Select an entry to read it, or create a new note.'}
              </p>
              <a href={`${base}/new`}>Create note</a>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
