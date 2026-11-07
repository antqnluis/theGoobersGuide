import { campaigns, characters } from './fixtures';
import type { Adventure, PreviewState, SharingProposal } from './model';

export function latestSharing(
  state: Pick<PreviewState, 'sharing'>,
  id: string,
) {
  return state.sharing
    .slice()
    .reverse()
    .find((proposal) => proposal.adventureId === id);
}

export function matchesMembership(
  proposal: SharingProposal,
  adventure: Adventure,
) {
  return (
    proposal.campaignId === adventure.campaignId &&
    proposal.membershipRevision === adventure.membershipRevision &&
    proposal.participantCharacterIds.length ===
      adventure.participantCharacterIds.length &&
    adventure.participantCharacterIds.every((id) =>
      proposal.participantCharacterIds.includes(id),
    )
  );
}

export function hasParty(campaignId: string) {
  return Boolean(
    campaigns.find((campaign) => campaign.id === campaignId)?.partyName,
  );
}

// The fixture's base visibility stays private. Effective visibility has one source:
// a current, unanimous proposal. No independently mutable "shared" flag exists.
export function effectiveAudience(
  state: Pick<PreviewState, 'sharing'>,
  adventure: Adventure,
): 'Participants only' | 'Party' {
  const proposal = latestSharing(state, adventure.id);
  if (
    !hasParty(adventure.campaignId) ||
    !proposal ||
    proposal.status !== 'Approved' ||
    !matchesMembership(proposal, adventure) ||
    !adventure.participantCharacterIds.length
  )
    return 'Participants only';
  return adventure.participantCharacterIds.every((id) => {
    const character = characters.find(
      (item) => item.id === id && item.campaignId === adventure.campaignId,
    );
    const decision = proposal.decisions
      .slice()
      .reverse()
      .find((item) => item.characterId === id);
    return (
      character &&
      decision?.state === 'Approved' &&
      decision.actorId === character.ownerId
    );
  })
    ? 'Party'
    : 'Participants only';
}

export function invalidateSharing(
  sharing: SharingProposal[],
  adventureId: string,
  now: string,
) {
  return sharing.map((proposal) =>
    proposal.adventureId === adventureId &&
    ['Pending', 'Approved'].includes(proposal.status)
      ? {
          ...proposal,
          status: 'Invalidated' as const,
          updatedAt: now,
          revision: proposal.revision + 1,
        }
      : proposal,
  );
}
