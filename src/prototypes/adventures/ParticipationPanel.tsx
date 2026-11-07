import { useRef, useState } from 'react';
import { accounts, characters } from './fixtures';
import type { Adventure, PreviewState } from './model';
import type { ParticipationAction } from './participation';
import { activeRequest } from './selectors';

export type ParticipationInput = ParticipationAction extends infer A
  ? A extends ParticipationAction
    ? Omit<A, 'viewerId' | 'campaignId' | 'now' | 'newId'>
    : never
  : never;
const characterName = (id: string) =>
  characters.find((item) => item.id === id)?.name ?? 'Unknown character';

export default function ParticipationPanel({
  state,
  adventure,
  actorCharacterId,
  onAction,
  onDirty,
}: {
  state: PreviewState;
  adventure: Adventure;
  actorCharacterId: string;
  onAction: (action: ParticipationInput) => void;
  onDirty: (value: boolean) => void;
}) {
  const [candidate, setCandidate] = useState('');
  const [note, setNote] = useState('');
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const leaveTrigger = useRef<HTMLButtonElement>(null);
  const request = activeRequest(state, adventure.id);
  const candidates = characters.filter(
    (item) =>
      item.campaignId === state.campaignId &&
      !adventure.participantCharacterIds.includes(item.id),
  );
  const common = { id: adventure.id, actorCharacterId };
  const history = state.activity.filter(
    (item) => item.adventureId === adventure.id,
  );
  function closeLeave() {
    leaveDialog.current?.close();
    leaveTrigger.current?.focus();
  }
  return (
    <>
      <section aria-labelledby="participants-heading">
        <h2 id="participants-heading">Participants</h2>
        <p className="ap-muted">
          Only accounts owning accepted characters can view and edit. Each
          character approves invitations separately.
        </p>
        <ul className="ap-participants">
          {adventure.participantCharacterIds.map((id) => (
            <li key={id}>
              <span>
                {characterName(id)}{' '}
                <span className="ap-muted">
                  —{' '}
                  {
                    accounts.find(
                      (account) =>
                        account.id ===
                        characters.find((item) => item.id === id)?.ownerId,
                    )?.name
                  }
                </span>
              </span>
              {id !== actorCharacterId && !request && (
                <button
                  onClick={() =>
                    onAction({
                      ...common,
                      type: 'propose',
                      kind: 'remove',
                      targetCharacterId: id,
                    })
                  }
                >
                  Request removal of {characterName(id)}
                </button>
              )}
            </li>
          ))}
        </ul>
        {request ? (
          <div className="ap-request" aria-labelledby="membership-heading">
            <h3 id="membership-heading">
              {request.kind === 'remove'
                ? 'Removal agreement'
                : request.status === 'approving'
                  ? 'Invitation proposal'
                  : 'Invitation sent'}
            </h3>
            <p>
              {characterName(request.targetCharacterId)}
              {request.kind === 'remove'
                ? ' can agree or decline. Membership stays unchanged until agreement.'
                : request.status === 'approving'
                  ? ' will receive an invitation only after every accepted character approves.'
                  : ' has not joined yet. Their owner must accept.'}
            </p>
            {request.kind === 'invite' && (
              <ul className="ap-approval-list">
                {adventure.participantCharacterIds.map((id) => (
                  <li key={id}>
                    {characterName(id)}:{' '}
                    {request.approvedCharacterIds.includes(id)
                      ? 'Approved'
                      : 'Awaiting approval'}
                  </li>
                ))}
              </ul>
            )}
            <div className="ap-actions">
              {request.kind === 'invite' &&
                request.status === 'approving' &&
                !request.approvedCharacterIds.includes(actorCharacterId) && (
                  <>
                    <button
                      onClick={() =>
                        onAction({
                          ...common,
                          type: 'decide',
                          requestId: request.id,
                          approve: true,
                        })
                      }
                    >
                      Approve invitation
                    </button>
                    <button
                      onClick={() =>
                        onAction({
                          ...common,
                          type: 'decide',
                          requestId: request.id,
                          approve: false,
                        })
                      }
                    >
                      Reject invitation
                    </button>
                  </>
                )}
              {request.kind === 'remove' &&
                request.targetCharacterId === actorCharacterId && (
                  <>
                    <button
                      onClick={() =>
                        onAction({
                          ...common,
                          type: 'decide',
                          requestId: request.id,
                          approve: true,
                        })
                      }
                    >
                      Agree to leave
                    </button>
                    <button
                      onClick={() =>
                        onAction({
                          ...common,
                          type: 'decide',
                          requestId: request.id,
                          approve: false,
                        })
                      }
                    >
                      Decline removal
                    </button>
                  </>
                )}
              {request.proposerCharacterId === actorCharacterId && (
                <button
                  onClick={() =>
                    onAction({
                      ...common,
                      type: 'cancel-request',
                      requestId: request.id,
                    })
                  }
                >
                  Cancel request
                </button>
              )}
            </div>
          </div>
        ) : candidates.length > 0 ? (
          <form
            className="ap-invite-form"
            onSubmit={(event) => {
              event.preventDefault();
              onAction({
                ...common,
                type: 'propose',
                kind: 'invite',
                targetCharacterId: candidate || candidates[0].id,
              });
            }}
          >
            <label>
              Character to invite
              <select
                value={candidate || candidates[0].id}
                onChange={(event) => setCandidate(event.target.value)}
              >
                {candidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} —{' '}
                    {
                      accounts.find((account) => account.id === item.ownerId)
                        ?.name
                    }
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Propose invitation</button>
          </form>
        ) : (
          <p className="ap-muted">
            Every character in this campaign is already participating.
          </p>
        )}
        <button
          ref={leaveTrigger}
          className="ap-back"
          onClick={() => leaveDialog.current?.showModal()}
        >
          Leave as {characterName(actorCharacterId)}
        </button>
        {adventure.participantCharacterIds.length === 1 && (
          <p className="ap-muted">
            Keep at least one accepted participant. The final character cannot
            leave in this preview.
          </p>
        )}
      </section>
      <section aria-labelledby="updates-heading">
        <h2 id="updates-heading">Updates and activity</h2>
        <form
          className="ap-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAction({ ...common, type: 'note', text: note });
          }}
        >
          <label>
            Short update
            <textarea
              rows={3}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                onDirty(Boolean(event.target.value));
              }}
            />
          </label>
          <div className="ap-actions">
            <button type="submit">Post update</button>
            {note && (
              <button
                type="button"
                onClick={() => {
                  setNote('');
                  onDirty(false);
                }}
              >
                Discard update
              </button>
            )}
          </div>
        </form>
        <ol className="ap-activity">
          {[...history].reverse().map((item) => (
            <li key={item.id}>
              <p>
                <strong>
                  {
                    accounts.find((account) => account.id === item.actorId)
                      ?.name
                  }{' '}
                  as {characterName(item.characterId)}
                </strong>{' '}
                — {item.message}
              </p>
              {item.note && <p>{item.note}</p>}
              <time className="ap-muted" dateTime={item.at}>
                {new Date(item.at).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
        {!history.length && (
          <p className="ap-muted">
            No recorded updates yet. This synthetic fixture starts with no
            activity.
          </p>
        )}
      </section>
      <dialog
        className="ap-discard-dialog"
        ref={leaveDialog}
        aria-labelledby="leave-title"
        aria-describedby="leave-description"
        onCancel={(event) => {
          event.preventDefault();
          closeLeave();
        }}
      >
        <h2 id="leave-title">Leave this adventure?</h2>
        <p id="leave-description">
          {characterName(actorCharacterId)} will leave. Your contributions
          remain. You lose access unless another character you own still
          participates. Pending membership requests will be canceled.
        </p>
        <div className="ap-actions">
          <button autoFocus onClick={closeLeave}>
            Stay
          </button>
          <button
            onClick={() => {
              closeLeave();
              onAction({ ...common, type: 'leave' });
            }}
          >
            Confirm leave
          </button>
        </div>
      </dialog>
    </>
  );
}

export function InvitationInbox({
  state,
  invitations,
  onAnswer,
}: {
  state: PreviewState;
  invitations: { requestId: string; characterId: string }[];
  onAnswer: (requestId: string, accept: boolean) => void;
}) {
  return (
    <section className="ap-inbox" aria-labelledby="invitation-heading">
      <h2 id="invitation-heading">Invitations</h2>
      <p className="ap-muted">
        Private details appear only after acceptance in this synthetic preview.
      </p>
      {!invitations.length && (
        <p>No pending invitations for your characters.</p>
      )}
      <ul className="ap-ledger">
        {invitations.map((invitation) => (
          <li key={invitation.requestId}>
            <p>
              Adventure invitation for{' '}
              <strong>
                {
                  characters.find(
                    (item) =>
                      item.id === invitation.characterId &&
                      item.ownerId === state.viewerId,
                  )?.name
                }
              </strong>
            </p>
            <div
              className="ap-actions"
              role="group"
              aria-label={`Invitation for ${characterName(invitation.characterId)}`}
            >
              <button onClick={() => onAnswer(invitation.requestId, true)}>
                Accept
              </button>
              <button onClick={() => onAnswer(invitation.requestId, false)}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
