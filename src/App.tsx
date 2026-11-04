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
  saveCharacter,
} from './features/characters/characterService';
import type { Character } from './features/characters/model';
import CharacterSheetPreview from './features/characters/CharacterSheetPreview';
import PartyReadOnly from './features/characters/PartyReadOnly';
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
  { route: 'characters', label: 'Character sheets' },
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
      setData(saveCharacter(repository, data, character));
      setFeedback(`Saved ${character.name.trim()}.`);
      setError(null);
      if (location.characterId === 'new')
        window.location.hash = `#/characters/${character.campaignId}/${character.id}`;
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

  function confirmCharacterDelete(character: Character) {
    if (!window.confirm(`Delete “${character.name}”? This cannot be undone.`))
      return;
    try {
      setData(
        deleteCharacter(repository, data, character.campaignId, character.id),
      );
      setFeedback(`Deleted ${character.name}.`);
      setError(null);
      if (location.characterId === character.id)
        window.location.hash = `#/party/${character.campaignId}`;
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
                onDelete={confirmCharacterDelete}
              />
            )}
            {activeCampaign &&
              route === 'characters' &&
              (location.characterId === 'new' ? (
                <CharacterSheetPreview
                  key={`${activeCampaign.id}-new`}
                  campaign={activeCampaign}
                  character={newCharacter(activeCampaign.id)}
                  creating
                  onSave={saveSheet}
                  error={error}
                  feedback={feedback}
                />
              ) : location.characterId &&
                characters.some((c) => c.id === location.characterId) ? (
                <CharacterSheetPreview
                  key={location.characterId}
                  campaign={activeCampaign}
                  character={characters.find(
                    (c) => c.id === location.characterId,
                  )!}
                  onSave={saveSheet}
                  onDelete={confirmCharacterDelete}
                  error={error}
                  feedback={feedback}
                />
              ) : (
                <div className="campaign-empty">
                  <h2>
                    {location.characterId
                      ? 'Character not found'
                      : 'Choose a character'}
                  </h2>
                  <p>
                    {location.characterId
                      ? 'This character is not in the selected campaign.'
                      : "Open a sheet from this campaign's party."}
                  </p>
                  <a
                    className="button button-primary"
                    href={`#/party/${activeCampaign.id}`}
                  >
                    View party
                  </a>
                </div>
              ))}
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
