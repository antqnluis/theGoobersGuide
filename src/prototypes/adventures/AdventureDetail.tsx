import { characters } from './fixtures';
import type { Adventure } from './model';

export default function AdventureDetail({
  adventure,
  error,
  onEdit,
  onStatus,
}: {
  adventure: Adventure;
  error: string | null;
  onEdit: () => void;
  onStatus: () => void;
}) {
  return (
    <>
      <div className="ap-heading">
        <div>
          <p className="ap-muted">
            {adventure.type} adventure · Participants only
          </p>
          <h1 tabIndex={-1}>{adventure.title}</h1>
        </div>
        <button onClick={onEdit}>Edit adventure</button>
      </div>
      <div className="ap-detail-summary">
        <div>
          <span className="ap-status">{adventure.status}</span>
          <p className="ap-muted">Player-tracked progress, not a DM ruling.</p>
        </div>
        <button onClick={onStatus}>
          {adventure.status === 'Completed'
            ? 'Reopen adventure'
            : 'Mark completed'}
        </button>
      </div>
      {error && (
        <p role="alert" className="ap-error">
          {error}
        </p>
      )}
      <section className="ap-next">
        <h2>Next step</h2>
        <p>
          {adventure.nextStep ||
            'No next step yet. Edit this adventure to leave yourself a reminder.'}
        </p>
      </section>
      {adventure.description && (
        <section className="ap-description">
          <h2>Description</h2>
          <p>{adventure.description}</p>
        </section>
      )}
      <section>
        <h2>Participants</h2>
        <p>
          {adventure.participantCharacterIds
            .map(
              (id) => characters.find((character) => character.id === id)?.name,
            )
            .filter(Boolean)
            .join(', ')}
        </p>
        <p className="ap-muted">
          Visible to the accounts owning these characters in this preview.
        </p>
      </section>
    </>
  );
}
