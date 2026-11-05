import { describe, expect, it } from 'vitest';
import { sampleCharacter, sampleNotes } from '../src/design/sampleData';
import {
  createCampaign,
  deleteCampaign,
  updateCampaignContext,
  updateCampaign,
} from '../src/features/campaigns/campaignService';
import { LocalStorageRepository } from '../src/shared/persistence/localStorageRepository';
import { emptyAppData } from '../src/shared/persistence/model';
import { savePartyName } from '../src/features/campaigns/partyService';

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  return { storage, repository: new LocalStorageRepository(storage) };
}

describe('campaign management', () => {
  it('creates multiple campaigns, edits only one, and persists after reload', () => {
    const { storage, repository } = setup();
    const first = createCampaign(repository, emptyAppData(), {
      name: ' Journey to Asterholm ',
      description: 'A long road',
    });
    const second = createCampaign(repository, first.data, {
      name: 'Western Reach',
    });
    expect(second.data.campaigns).toHaveLength(2);
    expect(first.campaign.name).toBe('Journey to Asterholm');
    expect(first.campaign.id).not.toBe(second.campaign.id);

    const withParty = savePartyName(
      repository,
      second.data,
      first.campaign.id,
      'The Bad Company',
    );
    const withContext = updateCampaignContext(
      repository,
      withParty,
      first.campaign.id,
      { currentLocation: 'Dunmar Pass', status: 'Active' },
    );
    const edited = updateCampaign(repository, withContext, first.campaign.id, {
      name: 'Asterholm Return',
      description: 'The road continues',
    });
    expect(edited.campaigns[0].description).toBe('The road continues');
    expect(edited.campaigns[0]).toMatchObject({
      partyName: 'The Bad Company',
      partyMemberCharacterIds: [],
      currentLocation: 'Dunmar Pass',
      status: 'Active',
    });
    expect(edited.campaigns[1]).toEqual(second.campaign);
    expect(new LocalStorageRepository(storage).load()).toEqual(edited);
  });

  it('deletes associated characters and notes while preserving another campaign', () => {
    const { storage, repository } = setup();
    const first = createCampaign(repository, emptyAppData(), {
      name: 'First',
    });
    const second = createCampaign(repository, first.data, {
      name: 'Second',
    });
    const linked = {
      ...second.data,
      characters: [
        {
          ...sampleCharacter,
          id: 'first-character',
          campaignId: first.campaign.id,
        },
        {
          ...sampleCharacter,
          id: 'second-character',
          campaignId: second.campaign.id,
        },
      ],
      notes: [
        { ...sampleNotes[0], id: 'first-note', campaignId: first.campaign.id },
        {
          ...sampleNotes[0],
          id: 'second-note',
          campaignId: second.campaign.id,
        },
      ],
    };
    repository.save(linked);
    const deleted = deleteCampaign(repository, linked, first.campaign.id);
    expect(deleted.campaigns).toEqual([second.campaign]);
    expect(deleted.characters.map((item) => item.id)).toEqual([
      'second-character',
    ]);
    expect(deleted.notes.map((item) => item.id)).toEqual(['second-note']);
    expect(new LocalStorageRepository(storage).load()).toEqual(deleted);
  });

  it('requires only a campaign name without creating a party', () => {
    const { repository } = setup();
    const created = createCampaign(repository, emptyAppData(), {
      name: 'A quiet beginning',
      description: 'Party setup can wait.',
    });
    expect(created.campaign).toMatchObject({
      name: 'A quiet beginning',
      description: 'Party setup can wait.',
      partyMemberCharacterIds: [],
    });
    expect(created.campaign.partyName).toBeUndefined();
    expect(() =>
      createCampaign(repository, emptyAppData(), {
        name: ' ',
      }),
    ).toThrow();
    expect(repository.load()).toEqual(created.data);
  });
});
