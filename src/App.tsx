import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CampaignLibrary from './features/campaigns/CampaignLibrary';
import CampaignOverview from './features/campaigns/CampaignOverview';
import {
  createCampaign,
  deleteCampaign,
  updateCampaign,
  type CampaignDetails,
} from './features/campaigns/campaignService';
import type { Campaign } from './features/campaigns/model';
import {
  deleteCharacter,
  newCharacter,
  selectCharacter,
  selectedCharacterId,
  saveCharacter,
} from './features/characters/characterService';
import {
  MAX_CHARACTER_IMPORT_BYTES,
  parseCharacterImport,
} from './features/characters/characterImport';
import type { Character } from './features/characters/model';
import CharacterSheetPreview from './features/characters/CharacterSheetPreview';
import CharacterWorkspace from './features/characters/CharacterWorkspace';
import PartyReadOnly from './features/characters/PartyReadOnly';
import {
  createCharacterExport,
  type CharacterExportFormat,
} from './features/characters/characterExport';
import DiceRoller from './features/dice/DiceRoller';
import CampaignJournal from './features/notes/CampaignJournal';
import {
  deleteNote,
  saveNote,
  type NoteDetails,
} from './features/notes/noteService';
import type { CampaignNote } from './features/notes/model';
import { browserLocalStorageRepository } from './shared/persistence/localStorageRepository';
import type { AppData } from './shared/persistence/model';
import { NavigationGuardContext } from './shared/ui/useUnsavedChanges';

type Route = 'campaigns' | 'campaign' | 'party' | 'characters' | 'notes';
type Location = {
  route: Route;
  campaignId: string | null;
  characterId: string | null;
};

const navigation: { route: Route; label: string }[] = [
  { route: 'campaigns', label: 'Campaign library' },
  { route: 'campaign', label: 'Overview' },
  { route: 'party', label: 'Party' },
  { route: 'characters', label: 'My Character' },
  { route: 'notes', label: 'Campaign notes' },
];

function currentLocation(): Location {
  const [route, campaignId, characterId] = window.location.hash
    .replace(/^#\/?/, '')
    .split('/');
  if (
    route !== 'campaign' &&
    route !== 'party' &&
    route !== 'characters' &&
    route !== 'notes'
  ) {
    return { route: 'campaigns', campaignId: null, characterId: null };
  }
  return {
    route,
    campaignId: campaignId || null,
    characterId: characterId || null,
  };
}

export default function App() {
  const repository = useMemo(browserLocalStorageRepository, []);
  const [data, setData] = useState<AppData>(() => repository.load());
  const [location, setLocation] = useState<Location>(currentLocation);
  const locationRef = useRef(location);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [characterImport, setCharacterImport] = useState<{
    campaignId: string;
    character: Character;
    sourceLabel: string;
  } | null>(null);
  const storageStatus = repository.getStatus();
  const diceDialog = useRef<HTMLDialogElement>(null);
  const diceTrigger = useRef<HTMLButtonElement>(null);
  const navigationGuard = useRef<(() => boolean) | null>(null);
  const registerGuard = useCallback((guard: () => boolean) => {
    navigationGuard.current = guard;
    return () => {
      if (navigationGuard.current === guard) navigationGuard.current = null;
    };
  }, []);

  const activeCampaign = data.campaigns.find(
    (campaign) => campaign.id === location.campaignId,
  );
  const route = activeCampaign ? location.route : 'campaigns';
  const characters = activeCampaign
    ? data.characters.filter(
        (character) => character.campaignId === activeCampaign.id,
      )
    : [];
  const notes = activeCampaign
    ? data.notes.filter((note) => note.campaignId === activeCampaign.id)
    : [];
  const preferredCharacterId = activeCampaign
    ? selectedCharacterId(data, activeCampaign.id)
    : null;

  useEffect(() => {
    const onHashChange = (event: HashChangeEvent) => {
      if (navigationGuard.current && !navigationGuard.current()) {
        window.history.replaceState(window.history.state, '', event.oldURL);
        return;
      }
      const next = currentLocation();
      if (
        locationRef.current.route !== next.route ||
        locationRef.current.campaignId !== next.campaignId
      ) {
        setFeedback(null);
        setError(null);
      }
      locationRef.current = next;
      setLocation(next);
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (
      !activeCampaign ||
      location.route !== 'characters' ||
      !location.characterId ||
      location.characterId === 'new' ||
      location.characterId === 'import' ||
      !characters.some((character) => character.id === location.characterId) ||
      data.preferences.selectedCharacterByCampaign[activeCampaign.id] ===
        location.characterId
    )
      return;
    try {
      setData(
        selectCharacter(
          repository,
          data,
          activeCampaign.id,
          location.characterId,
        ),
      );
    } catch {
      setError('The selected character could not be remembered.');
    }
  }, [
    activeCampaign,
    characters,
    data,
    location.characterId,
    location.route,
    repository,
  ]);

  function saveCreate(details: CampaignDetails): boolean {
    try {
      const result = createCampaign(repository, data, details);
      setData(result.data);
      setFeedback(`Created ${result.campaign.name}.`);
      setError(null);
      return true;
    } catch {
      setError(
        'Campaign could not be saved. Check browser storage and try again.',
      );
      return false;
    }
  }

  function saveUpdate(id: string, details: CampaignDetails): boolean {
    try {
      setData(updateCampaign(repository, data, id, details));
      setFeedback(`Saved changes to ${details.name.trim()}.`);
      setError(null);
      return true;
    } catch {
      setError(
        'Campaign could not be saved. Check browser storage and try again.',
      );
      return false;
    }
  }

  function confirmDelete(campaign: Campaign) {
    if (
      !window.confirm(
        `Delete “${campaign.name}” and all its characters and notes? This cannot be undone.`,
      )
    )
      return;
    try {
      setData(deleteCampaign(repository, data, campaign.id));
      setFeedback(`Deleted ${campaign.name} and its associated records.`);
      setError(null);
      if (location.campaignId === campaign.id)
        window.location.hash = '#/campaigns';
    } catch {
      setError(
        'Campaign could not be deleted. Check browser storage and try again.',
      );
    }
  }

  function openDice() {
    setMenuOpen(false);
    diceDialog.current?.showModal();
    diceDialog.current
      ?.querySelector<HTMLButtonElement>('.die-option-active')
      ?.focus();
  }

  function saveSheet(character: Character): boolean {
    try {
      let next = saveCharacter(repository, data, character);
      const importing = location.characterId === 'import';
      const creating = location.characterId === 'new';
      if (creating || importing)
        next = selectCharacter(
          repository,
          next,
          character.campaignId,
          character.id,
        );
      setData(next);
      setFeedback(
        importing
          ? `Imported ${character.name.trim()}.`
          : `Saved ${character.name.trim()}.`,
      );
      setError(null);
      if (creating || importing)
        window.location.hash = `#/characters/${character.campaignId}/${character.id}`;
      if (importing) setCharacterImport(null);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Character could not be saved.',
      );
      return false;
    }
  }

  function stageCharacterImport(
    campaignId: string,
    source: string,
    sourceLabel: string,
  ): boolean {
    setFeedback(null);
    setError(null);
    if (!source.trim()) {
      setError('Paste character JSON before continuing.');
      return false;
    }
    try {
      const character = parseCharacterImport(source, campaignId);
      setCharacterImport({ campaignId, character, sourceLabel });
      window.location.hash = `#/characters/${campaignId}/import`;
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The character JSON could not be read.',
      );
      return false;
    }
  }

  async function importCharacterFile(
    campaignId: string,
    file: File,
  ): Promise<boolean> {
    setFeedback(null);
    setError(null);
    if (file.size > MAX_CHARACTER_IMPORT_BYTES) {
      setError('Choose a character JSON file smaller than 1 MB.');
      return false;
    }
    try {
      return stageCharacterImport(campaignId, await file.text(), file.name);
    } catch {
      setError('The character file could not be read.');
      return false;
    }
  }

  function exportCharacter(
    character: Character,
    format: CharacterExportFormat,
  ) {
    try {
      const file = createCharacterExport(character, format);
      const url = URL.createObjectURL(
        new Blob([file.content], { type: `${file.mimeType};charset=utf-8` }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setFeedback(
        `Exported ${character.name} as ${format === 'json' ? 'JSON' : 'Markdown'}.`,
      );
      setError(null);
    } catch {
      setError('Character could not be exported.');
    }
  }

  function confirmCharacterDelete(character: Character) {
    if (!window.confirm(`Delete “${character.name}”? This cannot be undone.`))
      return;
    try {
      let next = deleteCharacter(
        repository,
        data,
        character.campaignId,
        character.id,
      );
      const fallback = selectedCharacterId(next, character.campaignId);
      if (fallback)
        next = selectCharacter(
          repository,
          next,
          character.campaignId,
          fallback,
        );
      setData(next);
      setFeedback(`Deleted ${character.name}.`);
      setError(null);
      if (location.characterId === character.id)
        window.location.hash = `#/characters/${character.campaignId}${fallback ? `/${fallback}` : ''}`;
    } catch {
      setError('Character could not be deleted.');
    }
  }

  function saveJournalNote(details: NoteDetails, noteId?: string): boolean {
    if (!activeCampaign) return false;
    try {
      const result = saveNote(
        repository,
        data,
        activeCampaign.id,
        details,
        noteId,
      );
      setData(result.data);
      setFeedback(`Saved ${result.note.title}.`);
      setError(null);
      if (!noteId)
        window.location.hash = `#/notes/${activeCampaign.id}/${result.note.id}`;
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Note could not be saved.',
      );
      return false;
    }
  }

  function confirmNoteDelete(note: CampaignNote) {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`))
      return;
    try {
      setData(deleteNote(repository, data, note.campaignId, note.id));
      setFeedback(`Deleted ${note.title}.`);
      setError(null);
      window.location.hash = `#/notes/${note.campaignId}`;
    } catch {
      setError('Note could not be deleted.');
    }
  }

  return (
    <NavigationGuardContext.Provider value={registerGuard}>
      <div className="app-shell">
        {menuOpen && (
          <button
            type="button"
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
          aria-label="Application navigation"
        >
          <a
            className="brand"
            href="#/campaigns"
            onClick={() => setMenuOpen(false)}
          >
            <span className="brand-mark" aria-hidden="true">
              G
            </span>
            <span>The Goober&apos;s Guide</span>
          </a>
          <div className="sidebar-rule" />
          <div className="sidebar-campaign">
            {activeCampaign ? (
              <>
                <span>Current campaign</span>
                <strong>{activeCampaign.name}</strong>
                <small>{activeCampaign.partyName}</small>
              </>
            ) : (
              <>
                <span>Campaigns</span>
                <strong>Your adventures</strong>
                <small>Choose a campaign to continue</small>
              </>
            )}
          </div>
          <nav className="sidebar-nav" aria-label="Primary">
            {navigation
              .filter((item) => item.route === 'campaigns' || activeCampaign)
              .map((item) => (
                <a
                  key={item.route}
                  href={
                    item.route === 'campaigns'
                      ? '#/campaigns'
                      : item.route === 'characters'
                        ? `#/characters/${activeCampaign?.id}${preferredCharacterId ? `/${preferredCharacterId}` : ''}`
                        : `#/${item.route}/${activeCampaign?.id}`
                  }
                  aria-current={route === item.route ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  <span>{item.label}</span>
                  {route === item.route && <span aria-hidden="true">—</span>}
                </a>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <span>Local guide</span>
            <small>Saved in this browser</small>
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="topbar-leading">
              <button
                type="button"
                className="menu-button"
                aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span />
                <span />
                <span />
              </button>
              <span className="topbar-campaign">
                {activeCampaign ? activeCampaign.name : 'Campaign library'}
              </span>
            </div>
            <button
              type="button"
              className="dice-trigger"
              ref={diceTrigger}
              onClick={openDice}
            >
              <span aria-hidden="true">d20</span> Dice roller
            </button>
          </header>
          <main className="workspace-main">
            {storageStatus.kind !== 'ready' && (
              <p className="form-error" role="alert">
                {storageStatus.message}
              </p>
            )}
            {route === 'campaigns' && (
              <CampaignLibrary
                campaigns={data.campaigns}
                onCreate={saveCreate}
                onUpdate={saveUpdate}
                onDelete={confirmDelete}
                error={error}
                feedback={feedback}
              />
            )}
            {activeCampaign && route === 'campaign' && (
              <CampaignOverview
                campaign={activeCampaign}
                characters={characters}
                notes={notes}
              />
            )}
            {activeCampaign && route === 'party' && (
              <PartyReadOnly
                campaign={activeCampaign}
                characters={characters}
              />
            )}
            {activeCampaign && route === 'characters' && (
              <CharacterWorkspace
                key={activeCampaign.id}
                campaign={activeCampaign}
                characters={characters}
                selectedCharacterId={
                  location.characterId &&
                  characters.some(
                    (character) => character.id === location.characterId,
                  )
                    ? location.characterId
                    : preferredCharacterId
                }
                onImportFile={(file) =>
                  importCharacterFile(activeCampaign.id, file)
                }
                onImportText={(source) =>
                  stageCharacterImport(activeCampaign.id, source, 'pasted JSON')
                }
                error={error}
              >
                {location.characterId === 'new' ? (
                  <CharacterSheetPreview
                    key={`${activeCampaign.id}-new`}
                    campaign={activeCampaign}
                    character={newCharacter(activeCampaign.id)}
                    creating
                    onCancel={() => {
                      window.location.hash = `#/characters/${activeCampaign.id}${preferredCharacterId ? `/${preferredCharacterId}` : ''}`;
                    }}
                    onSave={saveSheet}
                    error={error}
                    feedback={feedback}
                  />
                ) : location.characterId === 'import' &&
                  characterImport?.campaignId === activeCampaign.id ? (
                  <CharacterSheetPreview
                    key={`${activeCampaign.id}-import-${characterImport.sourceLabel}`}
                    campaign={activeCampaign}
                    character={characterImport.character}
                    creating
                    importSource={characterImport.sourceLabel}
                    onCancel={() => {
                      setCharacterImport(null);
                      window.location.hash = `#/characters/${activeCampaign.id}${preferredCharacterId ? `/${preferredCharacterId}` : ''}`;
                    }}
                    onSave={saveSheet}
                    error={error}
                    feedback={feedback}
                  />
                ) : (location.characterId ?? preferredCharacterId) &&
                  characters.some(
                    (character) =>
                      character.id ===
                      (location.characterId ?? preferredCharacterId),
                  ) ? (
                  <CharacterSheetPreview
                    key={location.characterId ?? preferredCharacterId}
                    campaign={activeCampaign}
                    character={characters.find(
                      (character) =>
                        character.id ===
                        (location.characterId ?? preferredCharacterId),
                    )!}
                    onSave={saveSheet}
                    onDelete={confirmCharacterDelete}
                    onExport={exportCharacter}
                    error={error}
                    feedback={feedback}
                  />
                ) : location.characterId ? (
                  <div className="campaign-empty">
                    <h2>Character not found</h2>
                    <p>This character is not in the selected campaign.</p>
                    <a
                      className="button button-primary"
                      href={`#/characters/${activeCampaign.id}${preferredCharacterId ? `/${preferredCharacterId}` : ''}`}
                    >
                      Return to My Character
                    </a>
                  </div>
                ) : (
                  <div className="campaign-empty">
                    <h2>No character yet</h2>
                    <p>
                      Create a character manually, import JSON, or use the
                      Markdown guide above to prepare a character file.
                    </p>
                  </div>
                )}
              </CharacterWorkspace>
            )}
            {activeCampaign && route === 'notes' && (
              <CampaignJournal
                key={`${activeCampaign.id}-${location.characterId ?? 'index'}`}
                campaign={activeCampaign}
                notes={notes}
                noteId={location.characterId}
                onSave={saveJournalNote}
                onDelete={confirmNoteDelete}
                feedback={feedback}
                error={error}
              />
            )}
          </main>
        </div>
        <dialog
          className="dice-dialog"
          ref={diceDialog}
          aria-labelledby="dice-title"
          onClose={() => diceTrigger.current?.focus()}
          onClick={(event) => {
            if (event.target === diceDialog.current)
              diceDialog.current?.close();
          }}
        >
          <DiceRoller onClose={() => diceDialog.current?.close()} />
        </dialog>
      </div>
    </NavigationGuardContext.Provider>
  );
}
