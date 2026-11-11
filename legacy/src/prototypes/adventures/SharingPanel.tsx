import type { Adventure, PreviewState } from './model';
import { characters } from './fixtures';
import { effectiveAudience, hasParty, latestSharing } from './consent';
import type { SharingInput } from './sharing';

export default function SharingPanel({
  state,
  adventure,
  actorCharacterId,
  onAction,
}: {
  state: PreviewState;
  adventure: Adventure;
  actorCharacterId: string;
  onAction: (input: SharingInput) => void;
}) {
  const proposal = latestSharing(state, adventure.id);
  const current = proposal && ['Pending', 'Approved'].includes(proposal.status);
  const decision = proposal?.decisions
    .slice()
    .reverse()
    .find((item) => item.characterId === actorCharacterId);
  const common = {
    id: adventure.id,
    actorCharacterId,
    membershipRevision: adventure.membershipRevision,
  };
  const response = proposal
    ? {
        ...common,
        proposalId: proposal.id,
        proposalRevision: proposal.revision,
      }
    : null;
  return (
    <section className="ap-sharing" aria-labelledby="sharing-heading">
      <div className="ap-sharing-heading">
        <h2 id="sharing-heading">Party sharing</h2>
        <span className="ap-status">
          {effectiveAudience(state, adventure) === 'Party'
            ? 'Shared with party'
            : 'Participants only'}
        </span>
      </div>
      <p>
        Sharing includes this whole adventure, its existing history, and future
        updates. Accounts owning characters currently on the campaign’s party
        roster can read it, including future roster members. Only accepted
        participants can edit.
      </p>
      <p className="ap-muted">
        Every accepted character must explicitly approve, even when one account
        owns several. Withdrawing consent stops further party access; it cannot
        recall anything already seen or copied.
      </p>
      {!hasParty(adventure.campaignId) ? (
        <p className="ap-notice">
          This campaign has no party. This adventure stays participants only.
        </p>
      ) : (
        <>
          {proposal && (
            <div className="ap-consent-ledger">
              <h3>
                {proposal.status === 'Invalidated'
                  ? 'Membership changed — fresh consent required'
                  : `Sharing proposal: ${proposal.status}`}
              </h3>
              {proposal.status === 'Invalidated' ? (
                <p>
                  The accepted participants changed. Previous approvals no
                  longer apply. Propose sharing again to collect fresh consent
                  from everyone.
                </p>
              ) : (
                <>
                  <p>
                    {
                      proposal.decisions.filter(
                        (item, index, all) =>
                          item.state === 'Approved' &&
                          !all
                            .slice(index + 1)
                            .some(
                              (later) => later.characterId === item.characterId,
                            ),
                      ).length
                    }{' '}
                    of {proposal.participantCharacterIds.length} approved
                    {current ? '' : ' on this closed proposal'}.
                  </p>
                  <ul className="ap-approval-list">
                    {proposal.participantCharacterIds.map((id) => (
                      <li key={id}>
                        <span>
                          {characters.find((character) => character.id === id)
                            ?.name ?? 'Unknown character'}
                        </span>
                        <strong>
                          {proposal.decisions
                            .slice()
                            .reverse()
                            .find((item) => item.characterId === id)?.state ??
                            'Pending'}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div className="ap-actions">
            {!current && (
              <button
                onClick={() => onAction({ ...common, type: 'propose-sharing' })}
              >
                {proposal ? 'Propose sharing again' : 'Share with party'}
              </button>
            )}
            {current && response && (
              <>
                {proposal.status === 'Pending' && !decision && (
                  <>
                    <button
                      className="ap-primary"
                      onClick={() =>
                        onAction({
                          ...response,
                          type: 'decide-sharing',
                          approve: true,
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        onAction({
                          ...response,
                          type: 'decide-sharing',
                          approve: false,
                        })
                      }
                    >
                      Decline
                    </button>
                  </>
                )}
                {decision?.state === 'Approved' && (
                  <button
                    onClick={() =>
                      onAction({ ...response, type: 'withdraw-sharing' })
                    }
                  >
                    Withdraw consent
                  </button>
                )}
                {proposal.status === 'Pending' &&
                  proposal.proposerCharacterId === actorCharacterId && (
                    <button
                      onClick={() =>
                        onAction({ ...response, type: 'cancel-sharing' })
                      }
                    >
                      Cancel sharing proposal
                    </button>
                  )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
