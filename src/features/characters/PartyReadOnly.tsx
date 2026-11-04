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
      </div>
      {characters.length ? (
        characters.map((character) => (
          <div className="party-entry party-entry-large" key={character.id}>
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
              {character.combat.currentHp}/{character.combat.maximumHp} HP
            </span>
          </div>
        ))
      ) : (
        <p className="section-empty">
          No party members yet. Members will appear here when added.
        </p>
      )}
    </div>
  );
}
