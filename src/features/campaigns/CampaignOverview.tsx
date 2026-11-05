import { useEffect, useState, type FormEvent } from 'react';
import type { Character } from '../characters/model';
import type { CampaignNote } from '../notes/model';
import type { Campaign } from './model';
import { recentNotes as getRecentNotes } from '../notes/noteService';
import { type CampaignContextDetails } from './campaignService';
import { demoUserById, type DemoUserId } from '../auth/demoAuth';
import { useUnsavedChanges } from '../../shared/ui/useUnsavedChanges';
import CampaignMapPreview from './CampaignMapPreview';

interface Props {
  campaign: Campaign;
  characters: Character[];
  notes: CampaignNote[];
  viewerUserId: DemoUserId;
  onUpdateContext: (details: CampaignContextDetails) => boolean;
  onUpdateMap: (mapDataUrl?: string) => boolean;
  error: string | null;
  feedback: string | null;
}

export default function CampaignOverview({
  campaign,
  characters,
  notes,
  viewerUserId,
  onUpdateContext,
  onUpdateMap,
  error,
  feedback,
}: Props) {
  const [editingContext, setEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState<CampaignContextDetails>({
    currentLocation: campaign.currentLocation ?? '',
    status: campaign.status ?? '',
  });
  const dirty =
    editingContext &&
    JSON.stringify(contextDraft) !==
      JSON.stringify({
        currentLocation: campaign.currentLocation ?? '',
        status: campaign.status ?? '',
      });
  useUnsavedChanges(dirty, 'Discard unsaved campaign details?');
  useEffect(() => {
    if (!editingContext)
      setContextDraft({
        currentLocation: campaign.currentLocation ?? '',
        status: campaign.status ?? '',
      });
  }, [campaign.currentLocation, campaign.status, editingContext]);

  const recentNotes = getRecentNotes(notes);
  const memberIds = new Set(campaign.partyMemberCharacterIds);
  const galleryCharacters = [...characters].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  function saveContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onUpdateContext(contextDraft)) setEditingContext(false);
  }

  return (
    <div className="preview-page">
      <div className="page-heading">
        <p className="page-context">
          <a href="#/campaigns">Campaign library</a> / Overview
        </p>
        <h1>{campaign.name}</h1>
        {campaign.description && <p>{campaign.description}</p>}
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
      <div className="overview-context-grid">
        <section className="overview-campaign-details">
          <div className="section-heading">
            <h2>Campaign details</h2>
            {!editingContext && (
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setEditingContext(true)}
              >
                Edit details
              </button>
            )}
          </div>
          <div className="overview-summary">
            <div>
              <span>Party</span>
              <strong>{campaign.partyName ?? 'No party created'}</strong>
              {!campaign.partyName && (
                <a href={`#/party/${campaign.id}`}>Create party</a>
              )}
            </div>
            <div>
              <span>Current location</span>
              <strong>{campaign.currentLocation || 'Not set'}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{campaign.status || 'Not set'}</strong>
            </div>
          </div>
          {editingContext && (
            <form className="campaign-context-form" onSubmit={saveContext}>
              <label>
                Current location
                <input
                  className="field-input"
                  value={contextDraft.currentLocation ?? ''}
                  maxLength={160}
                  onChange={(event) =>
                    setContextDraft((current) => ({
                      ...current,
                      currentLocation: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Status
                <input
                  className="field-input"
                  value={contextDraft.status ?? ''}
                  maxLength={120}
                  onChange={(event) =>
                    setContextDraft((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="campaign-actions">
                <button className="button button-primary" type="submit">
                  Save details
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm('Discard unsaved campaign details?')
                    ) {
                      setContextDraft({
                        currentLocation: campaign.currentLocation ?? '',
                        status: campaign.status ?? '',
                      });
                      setEditingContext(false);
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
        <CampaignMapPreview
          campaignName={campaign.name}
          mapDataUrl={campaign.mapDataUrl}
          onSave={onUpdateMap}
        />
      </div>
      <section
        className="character-gallery-section"
        aria-labelledby="character-gallery-heading"
      >
        <div className="section-heading">
          <h2 id="character-gallery-heading">Campaign characters</h2>
          <a href={`#/characters/${campaign.id}`}>Open My Character</a>
        </div>
        {galleryCharacters.length ? (
          <div className="character-gallery">
            {galleryCharacters.map((character) => {
              const inParty = memberIds.has(character.id);
              const isOwner = character.ownerUserId === viewerUserId;
              return (
                <a
                  className="character-card"
                  href={`#/characters/${campaign.id}/${character.id}`}
                  key={character.id}
                >
                  <div className="character-card-portrait-wrap">
                    {character.portraitDataUrl ? (
                      <img
                        className="character-card-portrait"
                        src={character.portraitDataUrl}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="character-card-initial"
                        aria-hidden="true"
                      >
                        {character.name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                    )}
                    <span
                      className={`character-card-party-status${inParty ? ' is-member' : ''}`}
                    >
                      {inParty ? 'In party' : 'Not in party'}
                    </span>
                  </div>
                  <div className="character-card-body">
                    <div className="character-card-heading">
                      <h3>{character.name || 'Unnamed character'}</h3>
                      <p>
                        {character.playerName ||
                          demoUserById(character.ownerUserId)?.displayName ||
                          'Player'}
                      </p>
                    </div>
                    <p className="character-card-identity">
                      Level {character.level} {character.species}{' '}
                      {character.className}
                      {character.subclass ? ` · ${character.subclass}` : ''}
                    </p>
                    <div
                      className="character-card-stats"
                      aria-label="Combat statistics"
                    >
                      <span>
                        <small>HP</small>
                        <strong>
                          {character.combat.currentHp}/
                          {character.combat.maximumHp}
                        </strong>
                      </span>
                      <span>
                        <small>AC</small>
                        <strong>{character.combat.armorClass}</strong>
                      </span>
                    </div>
                    <p className="character-card-owner">
                      {isOwner
                        ? 'Your character'
                        : `Read-only · ${demoUserById(character.ownerUserId)?.displayName ?? 'Another player'}`}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="section-empty">
            No characters in this campaign yet.{' '}
            <a href={`#/characters/${campaign.id}/new`}>Create a character</a>.
          </p>
        )}
      </section>
      <div className="overview-columns">
        <section
          className="preview-section"
          aria-labelledby="notes-overview-heading"
        >
          <div className="section-heading">
            <h2 id="notes-overview-heading">Recent notes</h2>
            <a href={`#/notes/${campaign.id}`}>View notes</a>
          </div>
          {recentNotes.length ? (
            recentNotes.map((note) => (
              <a
                className="recent-note"
                href={`#/notes/${campaign.id}/${note.id}`}
                key={note.id}
              >
                {note.category && <span>{note.category}</span>}
                <strong>{note.title}</strong>
                <p>{note.content}</p>
              </a>
            ))
          ) : (
            <p className="section-empty">
              No campaign notes yet.{' '}
              <a href={`#/notes/${campaign.id}/new`}>Create the first note</a>.
            </p>
          )}
        </section>
      </div>
      <div className="overview-shortcuts">
        <a
          className="button button-primary"
          href={`#/characters/${campaign.id}`}
        >
          Open My Character
        </a>
        <a className="button button-quiet" href={`#/party/${campaign.id}`}>
          Manage party
        </a>
        <a className="button button-quiet" href="#/campaigns">
          Campaign library
        </a>
      </div>
    </div>
  );
}
