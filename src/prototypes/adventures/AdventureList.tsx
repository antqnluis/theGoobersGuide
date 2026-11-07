import type { Adventure } from './model';

export default function AdventureList({
  adventures,
  view,
  canCreate,
  onView,
  onCreate,
  onOpen,
}: {
  adventures: Adventure[];
  view: 'active' | 'completed';
  canCreate: boolean;
  onView: (view: 'active' | 'completed') => void;
  onCreate: () => void;
  onOpen: (adventure: Adventure) => void;
}) {
  const shown = adventures.filter(
    (item) => (item.status === 'Completed') === (view === 'completed'),
  );
  return (
    <>
      <div className="ap-heading">
        <div>
          <h1 tabIndex={-1}>My Adventures</h1>
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
      <div className="ap-tabs" aria-label="Adventure views">
        {(['active', 'completed'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={view === value}
            onClick={() => onView(value)}
          >
            {value === 'active' ? 'Active' : 'Completed'}{' '}
            <span>
              {
                adventures.filter(
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
                  <span>{adventure.type} · Participants only</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ap-empty">
          <h2>
            {view === 'completed'
              ? 'Nothing completed yet'
              : 'A place for your next objective'}
          </h2>
          <p>
            {view === 'completed'
              ? 'Completed adventures remain here so you can return or reopen them.'
              : 'Record something your character wants to do. A title is all you need.'}
          </p>
          {canCreate && view === 'active' && (
            <button onClick={onCreate}>Create an adventure</button>
          )}
        </div>
      )}
    </>
  );
}
