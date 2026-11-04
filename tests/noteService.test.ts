import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CampaignOverview from '../src/features/campaigns/CampaignOverview';
import {
  createCampaign,
  deleteCampaign,
} from '../src/features/campaigns/campaignService';
import {
  deleteNote,
  recentNotes,
  saveNote,
} from '../src/features/notes/noteService';
import {
  LocalStorageRepository,
  APP_STORAGE_KEY,
} from '../src/shared/persistence/localStorageRepository';
import { emptyAppData } from '../src/shared/persistence/model';

function setup() {
  const store = new Map<string, string>();
  const repository = new LocalStorageRepository({
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  });
  const first = createCampaign(repository, emptyAppData(), {
    name: 'First',
    partyName: 'One',
  });
  const second = createCampaign(repository, first.data, {
    name: 'Second',
    partyName: 'Two',
  });
  return {
    store,
    repository,
    data: second.data,
    first: first.campaign,
    second: second.campaign,
  };
}

describe('campaign notes', () => {
  it('creates, edits and deletes notes without mixing campaigns', () => {
    const { repository, data, first, second } = setup();
    const a = saveNote(repository, data, first.id, {
      title: ' Meeting ',
      content: ' Met the guide ',
      category: 'NPCs',
    });
    const b = saveNote(repository, a.data, second.id, {
      title: 'Road',
      content: 'Travelled',
      category: 'Locations',
    });
    expect(a.note.createdAt).toBe(a.note.updatedAt);
    expect(a.note.title).toBe('Meeting');
    expect(b.data.notes).toHaveLength(2);
    const edited = saveNote(
      repository,
      b.data,
      first.id,
      {
        title: 'Meeting',
        content: 'Met the guide again',
        category: 'Session Notes',
      },
      a.note.id,
    );
    expect(edited.note.createdAt).toBe(a.note.createdAt);
    expect(edited.note.category).toBe('Session Notes');
    expect(edited.data.notes.find((note) => note.id === b.note.id)).toEqual(
      b.note,
    );
    expect(() =>
      saveNote(
        repository,
        edited.data,
        second.id,
        { title: 'Wrong', content: 'Wrong' },
        a.note.id,
      ),
    ).toThrow();
    expect(() =>
      deleteNote(repository, edited.data, second.id, a.note.id),
    ).toThrow();
    const reloaded = repository.load();
    expect(reloaded.notes).toEqual(edited.data.notes);
    const removed = deleteNote(repository, reloaded, first.id, a.note.id);
    expect(removed.notes).toEqual([b.note]);
    expect(deleteCampaign(repository, removed, second.id).notes).toEqual([]);
  });

  it('validates required content and recovers valid notes from malformed storage', () => {
    const { store, repository, data, first } = setup();
    expect(() =>
      saveNote(repository, data, first.id, { title: '', content: 'x' }),
    ).toThrow();
    expect(() =>
      saveNote(repository, data, 'missing', { title: 'x', content: 'y' }),
    ).toThrow();
    const saved = saveNote(repository, data, first.id, {
      title: 'Title',
      content: 'Text',
    });
    expect(saved.note.category).toBe('General');
    store.set(
      APP_STORAGE_KEY,
      JSON.stringify({
        ...saved.data,
        notes: [
          saved.note,
          { ...saved.note, id: 'bad', content: 7 },
          { ...saved.note, id: 'orphan', campaignId: 'missing' },
        ],
      }),
    );
    expect(repository.load().notes).toEqual([saved.note]);
    store.set(APP_STORAGE_KEY, JSON.stringify({ ...saved.data, notes: null }));
    expect(repository.load().notes).toEqual([]);
  });

  it('returns three most recently updated notes for the dashboard', () => {
    const { repository, data, first } = setup();
    let next = data;
    for (let index = 0; index < 4; index++) {
      next = saveNote(repository, next, first.id, {
        title: `Note ${index}`,
        content: 'Text',
      }).data;
    }
    const dated = next.notes.map((note, index) => ({
      ...note,
      updatedAt: `2026-11-0${index + 1}T00:00:00.000Z`,
    }));
    expect(recentNotes(dated).map((note) => note.title)).toEqual([
      'Note 3',
      'Note 2',
      'Note 1',
    ]);
    expect(recentNotes([])).toEqual([]);
    const html = renderToStaticMarkup(
      createElement(CampaignOverview, {
        campaign: first,
        characters: [],
        notes: dated,
      }),
    );
    expect(html).toContain(`#/notes/${first.id}/${dated[3].id}`);
    expect(html).not.toContain(`#/notes/${first.id}/${dated[0].id}`);
  });
});
