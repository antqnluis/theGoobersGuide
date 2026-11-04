import type { Campaign } from '../campaigns/model';
import type { CampaignNote } from './model';

export default function NotesReadOnly({
  campaign,
  notes,
}: {
  campaign: Campaign;
  notes: CampaignNote[];
}) {
  return (
    <div className="preview-page">
      <div className="page-heading">
        <p className="page-context">{campaign.name}</p>
        <h1>Campaign notes</h1>
      </div>
      {notes.length ? (
        <div className="notes-preview-list">
          {notes.map((note) => (
            <article className="note-preview" key={note.id}>
              {note.category && <span>{note.category}</span>}
              <h2>{note.title}</h2>
              <p>{note.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="section-empty">
          No campaign notes yet. Notes will appear here when added.
        </p>
      )}
    </div>
  );
}
