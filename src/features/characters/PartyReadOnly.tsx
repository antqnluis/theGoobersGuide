import type { Campaign } from '../campaigns/model';
import type { Character } from './model';

export default function PartyReadOnly({
  campaign,
  characters,
}: {
  campaign: Campaign;
  characters: Character[];
}) {
  return (
    <div className="preview-page">
      <div className="page-heading">
        <p className="page-context">{campaign.name}</p>
        <h1>Party</h1>
        <p>Select a party member to open their saved character sheet.</p>
      </div>
      {characters.length ? (
        characters.map((character) => (
          <a
            className="party-entry party-entry-large"
            href={`#/characters/${campaign.id}/${character.id}`}
            key={character.id}
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
              {character.combat.currentHp}/{character.combat.maximumHp} HP · AC{' '}
              {character.combat.armorClass}
            </span>
          </a>
        ))
      ) : (
        <div className="campaign-empty">
          <h2>No party members yet</h2>
          <p>Create a character in My Character to start this roster.</p>
          <a
            className="button button-primary"
            href={`#/characters/${campaign.id}`}
          >
            Open My Character
          </a>
        </div>
      )}
    </div>
  );
}
