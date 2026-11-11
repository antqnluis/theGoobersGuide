import { describe, expect, it } from 'vitest';
import {
  createCampaign,
  updateCampaignContext,
} from '../src/features/campaigns/campaignService';
import {
  addPartyMember,
  removePartyMember,
  savePartyName,
} from '../src/features/campaigns/partyService';
import {
  deleteCharacter,
  newCharacter,
  saveCharacter,
} from '../src/features/characters/characterService';
import { LocalStorageRepository } from '../src/shared/persistence/localStorageRepository';
import { emptyAppData } from '../src/shared/persistence/model';

function setup() {
  const store = new Map<string, string>();
  const repository = new LocalStorageRepository({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  });
  const first = createCampaign(repository, emptyAppData(), {
    name: 'The Iron Road',
  });
  const second = createCampaign(repository, first.data, {
    name: 'The Western Reach',
  });
  return {
    repository,
    first: first.campaign,
    second: second.campaign,
    data: second.data,
  };
}

describe('party management', () => {
  it('creates and renames a party without changing campaign context', () => {
    const { repository, first, data } = setup();
    const withContext = updateCampaignContext(repository, data, first.id, {
      currentLocation: 'Dunmar Pass',
      status: 'In progress',
    });
    const created = savePartyName(
      repository,
      withContext,
      first.id,
      'The Sable Company',
    );
    const renamed = savePartyName(
      repository,
      created,
      first.id,
      'The Wayfarers',
    );

    expect(
      renamed.campaigns.find((item) => item.id === first.id),
    ).toMatchObject({
      partyName: 'The Wayfarers',
      partyMemberCharacterIds: [],
      currentLocation: 'Dunmar Pass',
      status: 'In progress',
    });
    expect(() => savePartyName(repository, renamed, first.id, '  ')).toThrow(
      'Enter a party name',
    );
  });

  it('adds and removes only owned characters while keeping them in the campaign', () => {
    const { repository, first, second, data } = setup();
    const party = savePartyName(
      repository,
      data,
      first.id,
      'The Sable Company',
    );
    const ownCharacter = {
      ...newCharacter(first.id, 'player-one'),
      name: 'Ada One',
    };
    const otherCharacter = {
      ...newCharacter(first.id, 'player-two'),
      name: 'Beren Two',
    };
    const unrelatedCharacter = {
      ...newCharacter(second.id, 'player-one'),
      name: 'Cato Three',
    };
    const characters = saveCharacter(
      repository,
      saveCharacter(
        repository,
        saveCharacter(repository, party, ownCharacter, 'player-one'),
        otherCharacter,
        'player-two',
      ),
      unrelatedCharacter,
      'player-one',
    );
    const addedOwn = addPartyMember(
      repository,
      characters,
      first.id,
      ownCharacter.id,
      'player-one',
    );
    const addedOther = addPartyMember(
      repository,
      addedOwn,
      first.id,
      otherCharacter.id,
      'player-two',
    );

    expect(() =>
      addPartyMember(
        repository,
        addedOther,
        first.id,
        ownCharacter.id,
        'player-two',
      ),
    ).toThrow('only change party membership for your own characters');
    expect(() =>
      removePartyMember(
        repository,
        addedOther,
        first.id,
        ownCharacter.id,
        'player-two',
      ),
    ).toThrow('only change party membership for your own characters');
    expect(() =>
      addPartyMember(
        repository,
        addedOther,
        first.id,
        unrelatedCharacter.id,
        'player-one',
      ),
    ).toThrow('not found in this campaign');

    const removed = removePartyMember(
      repository,
      addedOther,
      first.id,
      ownCharacter.id,
      'player-one',
    );
    expect(
      removed.campaigns.find((item) => item.id === first.id)
        ?.partyMemberCharacterIds,
    ).toEqual([otherCharacter.id]);
    expect(removed.characters.map((item) => item.id)).toEqual([
      ownCharacter.id,
      otherCharacter.id,
      unrelatedCharacter.id,
    ]);
    expect(repository.load()).toEqual(removed);
  });

  it('rejects membership changes before a party exists', () => {
    const { repository, first, data } = setup();
    const character = { ...newCharacter(first.id), name: 'Ada One' };
    const saved = saveCharacter(repository, data, character, 'player-one');
    expect(() =>
      addPartyMember(repository, saved, first.id, character.id, 'player-one'),
    ).toThrow('Create a party before adding members');
  });

  it('clears party membership when an owned character is deleted', () => {
    const { repository, first, data } = setup();
    const party = savePartyName(
      repository,
      data,
      first.id,
      'The Sable Company',
    );
    const character = { ...newCharacter(first.id), name: 'Ada One' };
    const saved = saveCharacter(repository, party, character, 'player-one');
    const joined = addPartyMember(
      repository,
      saved,
      first.id,
      character.id,
      'player-one',
    );

    const deleted = deleteCharacter(
      repository,
      joined,
      first.id,
      character.id,
      'player-one',
    );

    expect(deleted.characters).toEqual([]);
    expect(
      deleted.campaigns.find((item) => item.id === first.id)
        ?.partyMemberCharacterIds,
    ).toEqual([]);
  });
});
