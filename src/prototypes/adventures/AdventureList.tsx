import type { Adventure, PreviewState } from './model';
import { effectiveAudience } from './consent';
import { acceptedOwnedCharacters } from './selectors';

export default function AdventureList({
  adventures,
  view,
  canCreate,
  onView,
  onCreate,
  onOpen,
  state,
  audience,
  onAudience,
}: {
  adventures: Adventure[];
  view: 'active' | 'completed';
  canCreate: boolean;
  onView: (view: 'active' | 'completed') => void;
  onCreate: () => void;
  onOpen: (adventure: Adventure) => void;
  state: PreviewState;
  audience: 'mine' | 'shared';
  onAudience: (audience: 'mine' | 'shared') => void;
}) {
  const inAudience = (value: 'mine' | 'shared') =>
    adventures.filter((adventure) =>
      value === 'mine'
        ? acceptedOwnedCharacters(state, adventure).length > 0
        : effectiveAudience(state, adventure) === 'Party',
    );
  const available = inAudience(audience);
  const shown = available.filter(
    (item) => (item.status === 'Completed') === (view === 'completed'),
  );
  return (
    <>
      <div className="ap-heading">
        <div>
          <h1 tabIndex={-1}>
            {audience === 'mine' ? 'My Adventures' : 'Shared with party'}
          </h1>
          <p className="ap-muted">
            Keep a goal close. Leave yourself a next step.
          </p>
        </div>
        <button className="ap-primary" disabled={!canCreate} onClick={onCreate}>
          New adventure
        </button>
      </div>
      {!canCreate && (
        <p className="ap-notice">
          This viewer has no owned character here. Choose a viewer with a
          character in Preview controls to create an adventure.
        </p>
      )}
      <div className="ap-tabs" role="group" aria-label="Adventure audience">
        {(['mine', 'shared'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={audience === value}
            onClick={() => onAudience(value)}
          >
            {value === 'mine' ? 'Mine' : 'Shared with party'}{' '}
            <span>{inAudience(value).length}</span>
          </button>
        ))}
      </div>
      <div className="ap-tabs" role="group" aria-label="Adventure progress">
        {(['active', 'completed'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={view === value}
            onClick={() => onView(value)}
          >
            {value === 'active' ? 'Active' : 'Completed'}{' '}
            <span>
              {
                available.filter(
                  (item) =>
                    (item.status === 'Completed') === (value === 'completed'),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="ap-ledger">
          {shown.map((adventure) => (
            <li key={adventure.id}>
              <button
                className="ap-adventure-link"
                onClick={() => onOpen(adventure)}
              >
                <span className="ap-row-main">
                  <strong>{adventure.title}</strong>
                  <span>
                    {adventure.nextStep ||
                      'Add a next step when you are ready.'}
                  </span>
                </span>
                <span className="ap-row-meta">
                  <span className="ap-status">{adventure.status}</span>
                  <span>
                    {adventure.type} ·{' '}
                    {effectiveAudience(state, adventure) === 'Party'
                      ? 'Shared with party'
                      : 'Participants only'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ap-empty">
          <h2>
            {audience === 'shared'
              ? 'No shared adventures here'
              : view === 'completed'
                ? 'Nothing completed yet'
                : 'A place for your next objective'}
          </h2>
          <p>
            {audience === 'shared'
              ? 'Adventures appear here only while every accepted character has approved party sharing and you have access.'
              : view === 'completed'
                ? 'Completed adventures remain here so you can return or reopen them.'
                : 'Record something your character wants to do. A title is all you need.'}
          </p>
          {canCreate && view === 'active' && audience === 'mine' && (
            <button onClick={onCreate}>Create an adventure</button>
          )}
        </div>
      )}
    </>
  );
}
