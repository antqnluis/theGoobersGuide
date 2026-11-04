import type { Character } from '../characters/model';
import type { CampaignNote } from '../notes/model';
import type { Campaign } from './model';
import { recentNotes as getRecentNotes } from '../notes/noteService';

interface Props {
  campaign: Campaign;
  characters: Character[];
  notes: CampaignNote[];
}

export default function CampaignOverview({
  campaign,
  characters,
  notes,
}: Props) {
  const recentNotes = getRecentNotes(notes);
  return (
    <div className="preview-page">
      <div className="page-heading">
        <p className="page-context">
          <a href="#/campaigns">Campaign library</a> / Overview
        </p>
        <h1>{campaign.name}</h1>
        {campaign.description && <p>{campaign.description}</p>}
      </div>
      <div className="overview-summary">
        <div>
          <span>Party</span>
          <strong>{campaign.partyName}</strong>
        </div>
        {campaign.currentLocation && (
          <div>
            <span>Current location</span>
            <strong>{campaign.currentLocation}</strong>
          </div>
        )}
        {campaign.status && (
          <div>
            <span>Status</span>
            <strong>{campaign.status}</strong>
          </div>
        )}
      </div>
      <div className="overview-columns">
        <section
          className="preview-section"
          aria-labelledby="party-overview-heading"
        >
          <div className="section-heading">
            <h2 id="party-overview-heading">Party at a glance</h2>
            <a href={`#/party/${campaign.id}`}>View party</a>
          </div>
          {characters.length ? (
            characters.map((character) => (
              <a
                className="party-entry"
                href={`#/characters/${campaign.id}/${character.id}`}
                key={character.id}
              >
                <span className="party-initial" aria-hidden="true">
                  {character.name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{character.name}</strong>
                  <small>
                    Level {character.level} {character.className}
                  </small>
                </span>
                <span className="party-entry-hp">
                  {character.combat.currentHp}/{character.combat.maximumHp} HP ·
                  AC {character.combat.armorClass}
                </span>
              </a>
            ))
          ) : (
            <p className="section-empty">
              No party members yet. Members will appear here when added.
            </p>
          )}
        </section>
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
        <a className="button button-quiet" href={`#/party/${campaign.id}`}>
          View party and character sheets
        </a>
        <a className="button button-quiet" href="#/campaigns">
          Campaign library
        </a>
      </div>
    </div>
  );
}
