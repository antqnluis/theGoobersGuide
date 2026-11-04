import type { Campaign } from '../campaigns/model';
import type { Character } from './model';

export default function PartyReadOnly({
  campaign,
  characters,
  onDelete,
}: {
  campaign: Campaign;
  characters: Character[];
  onDelete: (character: Character) => void;
}) {
  return (
    <div className="preview-page">
      <div className="page-heading">
        <p className="page-context">{campaign.name}</p>
        <h1>Party</h1>
        <a
          className="button button-primary"
          href={`#/characters/${campaign.id}/new`}
        >
          Add character
        </a>
      </div>
      {characters.length ? (
        characters.map((character) => (
          <div className="party-entry party-entry-large" key={character.id}>
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
              </span>
              <span className="party-entry-hp">
                {character.combat.currentHp}/{character.combat.maximumHp} HP ·
                AC {character.combat.armorClass}
              </span>
            </a>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => onDelete(character)}
              aria-label={`Delete ${character.name}`}
            >
              Delete
            </button>
          </div>
        ))
      ) : (
        <div className="campaign-empty">
          <h2>No party members yet</h2>
          <p>Add a character to start this campaign's roster.</p>
          <a
            className="button button-primary"
            href={`#/characters/${campaign.id}/new`}
          >
            Add character
          </a>
        </div>
      )}
    </div>
  );
}
