import type { Adventure } from './model';

export default function AdventureDetail({
  adventure,
  error,
  onEdit,
  onStatus,
  audience,
  canEdit,
}: {
  adventure: Adventure;
  error: string | null;
  onEdit: () => void;
  onStatus: () => void;
  audience: 'Participants only' | 'Party';
  canEdit: boolean;
}) {
  return (
    <>
      <div className="ap-heading">
        <div>
          <p className="ap-muted">
            {adventure.type} adventure ·{' '}
            {audience === 'Party' ? 'Shared with party' : audience}
          </p>
          <h1 tabIndex={-1}>{adventure.title}</h1>
        </div>
        {canEdit && <button onClick={onEdit}>Edit adventure</button>}
      </div>
      <div className="ap-detail-summary">
        <div>
          <span className="ap-status">{adventure.status}</span>
          <p className="ap-muted">Player-tracked progress, not a DM ruling.</p>
        </div>
        {canEdit && (
          <button onClick={onStatus}>
            {adventure.status === 'Completed'
              ? 'Reopen adventure'
              : 'Mark completed'}
          </button>
        )}
      </div>
      {!canEdit && (
        <p className="ap-notice">
          Read-only party view. Only accepted participants can edit or manage
          this adventure.
        </p>
      )}
      {error && (
        <p role="alert" tabIndex={-1} className="ap-error">
          {error}
        </p>
      )}
      <section className="ap-next">
        <h2>Next step</h2>
        <p>
          {adventure.nextStep ||
            (canEdit
              ? 'No next step yet. Edit this adventure to leave yourself a reminder.'
              : 'No next step recorded yet.')}
        </p>
      </section>
      {adventure.description && (
        <section className="ap-description">
          <h2>Description</h2>
          <p>{adventure.description}</p>
        </section>
      )}
    </>
  );
}
