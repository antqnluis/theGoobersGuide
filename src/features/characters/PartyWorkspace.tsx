import { useEffect, useState, type FormEvent } from 'react';
import type { Campaign } from '../campaigns/model';
import { demoUserById, type DemoUserId } from '../auth/demoAuth';
import { useUnsavedChanges } from '../../shared/ui/useUnsavedChanges';
import type { Character } from './model';

export default function PartyWorkspace({
  campaign,
  characters,
  viewerUserId,
  onSavePartyName,
  onAddMember,
  onRemoveMember,
  error,
  feedback,
}: {
  campaign: Campaign;
  characters: Character[];
  viewerUserId: DemoUserId;
  onSavePartyName: (name: string) => boolean;
  onAddMember: (characterId: string) => boolean;
  onRemoveMember: (characterId: string) => boolean;
  error: string | null;
  feedback: string | null;
}) {
  const [editingName, setEditingName] = useState(false);
  const [partyNameDraft, setPartyNameDraft] = useState(
    campaign.partyName ?? '',
  );
  const [formError, setFormError] = useState<string | null>(null);
  const nameDirty =
    editingName && partyNameDraft !== (campaign.partyName ?? '');
  useUnsavedChanges(nameDirty, 'Discard unsaved party changes?');

  useEffect(() => {
    if (!editingName) setPartyNameDraft(campaign.partyName ?? '');
  }, [campaign.partyName, editingName]);

  const memberIds = new Set(campaign.partyMemberCharacterIds);
  const members = characters.filter((character) => memberIds.has(character.id));
  const availableCharacters = characters.filter(
    (character) => !memberIds.has(character.id),
  );

  function savePartyName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partyNameDraft.trim()) {
      setFormError('Enter a party name.');
      return;
    }
    if (onSavePartyName(partyNameDraft)) {
      setPartyNameDraft(partyNameDraft.trim());
      setEditingName(false);
      setFormError(null);
    }
  }

  return (
    <div className="preview-page">
      <div className="page-heading">
        <p className="page-context">
          <a href={`#/campaign/${campaign.id}`}>{campaign.name}</a> / Party
        </p>
        <h1>Party</h1>
        <p>
          Choose who is traveling together. Characters can stay in My Character
          until their owner adds them here.
        </p>
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

      {!campaign.partyName && !editingName ? (
        <div className="campaign-empty party-setup-empty">
          <h2>No party yet</h2>
          <p>
            Create a party name for this campaign. You can add characters now or
            leave them in My Character until they are ready to join.
          </p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setPartyNameDraft('');
              setEditingName(true);
            }}
          >
            Create party
          </button>
        </div>
      ) : editingName ? (
        <form className="party-name-form" onSubmit={savePartyName}>
          <div className="section-heading">
            <h2>{campaign.partyName ? 'Rename party' : 'Create a party'}</h2>
          </div>
          <label>
            Party name <span>Required</span>
            <input
              className="field-input"
              value={partyNameDraft}
              onChange={(event) => setPartyNameDraft(event.target.value)}
              required
              maxLength={120}
              autoFocus
            />
          </label>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="campaign-actions">
            <button className="button button-primary" type="submit">
              {campaign.partyName ? 'Save party name' : 'Create party'}
            </button>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => {
                if (
                  !nameDirty ||
                  window.confirm('Discard unsaved party changes?')
                ) {
                  setPartyNameDraft(campaign.partyName ?? '');
                  setEditingName(false);
                  setFormError(null);
                }
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="party-name-line">
            <div>
              <span>Party</span>
              <h2>{campaign.partyName}</h2>
            </div>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => {
                setPartyNameDraft(campaign.partyName ?? '');
                setEditingName(true);
              }}
            >
              Rename party
            </button>
          </div>

          <section className="party-management-section">
            <div className="section-heading">
              <h2>Party members</h2>
              <span>
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </span>
            </div>
            {members.length ? (
              <div className="party-management-list">
                {members.map((character) => {
                  const isOwner = character.ownerUserId === viewerUserId;
                  return (
                    <div className="party-management-row" key={character.id}>
                      <a
                        className="party-entry-link"
                        href={`#/characters/${campaign.id}/${character.id}`}
                      >
                        <span className="party-initial" aria-hidden="true">
                          {character.name.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <strong>{character.name}</strong>
                          <small>
                            Level {character.level} {character.species}{' '}
                            {character.className}
                          </small>
                          <small className="party-entry-owner">
                            {isOwner
                              ? 'Your character'
                              : `Read-only · ${ownerName(character.ownerUserId)}`}
                          </small>
                        </span>
                        <span className="party-entry-hp">
                          {character.combat.currentHp}/
                          {character.combat.maximumHp} HP · AC{' '}
                          {character.combat.armorClass}
                        </span>
                      </a>
                      {isOwner && (
                        <button
                          type="button"
                          className="party-membership-action danger-link"
                          onClick={() => onRemoveMember(character.id)}
                          aria-label={`Remove ${character.name} from party`}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="section-empty">
                No characters are in this party yet. Add one from your campaign
                characters below.
              </p>
            )}
          </section>

          <section className="party-management-section">
            <div className="section-heading">
              <h2>Characters outside the party</h2>
              <a
                className="party-create-link"
                href={`#/characters/${campaign.id}`}
              >
                Open My Character
              </a>
            </div>
            {availableCharacters.length ? (
              <div className="party-management-list">
                {availableCharacters.map((character) => {
                  const isOwner = character.ownerUserId === viewerUserId;
                  return (
                    <div className="party-management-row" key={character.id}>
                      <a
                        className="party-entry-link"
                        href={`#/characters/${campaign.id}/${character.id}`}
                      >
                        <span className="party-initial" aria-hidden="true">
                          {character.name.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <strong>{character.name}</strong>
                          <small>
                            Level {character.level} {character.species}{' '}
                            {character.className}
                          </small>
                          <small className="party-entry-owner">
                            {isOwner
                              ? 'Your character'
                              : `Only ${ownerName(character.ownerUserId)} can add this character`}
                          </small>
                        </span>
                      </a>
                      {isOwner && (
                        <button
                          type="button"
                          className="party-membership-action"
                          onClick={() => onAddMember(character.id)}
                          aria-label={`Add ${character.name} to party`}
                        >
                          Add to party
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="section-empty">
                {characters.length
                  ? 'All campaign characters are currently in the party. Create another character in My Character to keep one outside the roster.'
                  : 'No characters in this campaign yet. Create one in My Character to add it when ready.'}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ownerName(ownerUserId: DemoUserId): string {
  return demoUserById(ownerUserId)?.displayName ?? 'another player';
}
