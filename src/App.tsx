import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CampaignLibrary from './features/campaigns/CampaignLibrary';
import CampaignOverview from './features/campaigns/CampaignOverview';
import {
  createCampaign,
  deleteCampaign,
  updateCampaignContext,
  updateCampaign,
  type CampaignContextDetails,
  type CampaignDetails,
} from './features/campaigns/campaignService';
import type { Campaign } from './features/campaigns/model';
import {
  addPartyMember,
  removePartyMember,
  savePartyName as savePartyNameService,
} from './features/campaigns/partyService';
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
import PartyWorkspace from './features/characters/PartyWorkspace';
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
import LoginScreen from './features/auth/LoginScreen';
import {
  clearDemoSession,
  demoUserById,
  readDemoSession,
  writeDemoSession,
  type DemoUser,
} from './features/auth/demoAuth';
import { browserLocalStorageRepository } from './shared/persistence/localStorageRepository';
import type { AppData } from './shared/persistence/model';
import { NavigationGuardContext } from './shared/ui/useUnsavedChanges';

type Route =
  'login' | 'campaigns' | 'campaign' | 'party' | 'characters' | 'notes';
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
  if (route === 'login')
    return { route: 'login', campaignId: null, characterId: null };
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
  const [sessionUser, setSessionUser] = useState<DemoUser | null>(
    readDemoSession,
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const locationRef = useRef(location);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(
    () => window.matchMedia('(max-width: 1050px)').matches,
  );
  const previousMenuOpen = useRef(false);
  const sidebar = useRef<HTMLElement>(null);
  const firstMenuLink = useRef<HTMLAnchorElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
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
    ? selectedCharacterId(data, activeCampaign.id, sessionUser?.id)
    : null;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1050px)');
    const updateCompactNavigation = () => {
      setCompactNavigation(mediaQuery.matches);
      if (!mediaQuery.matches) setMenuOpen(false);
    };
    mediaQuery.addEventListener('change', updateCompactNavigation);
    return () =>
      mediaQuery.removeEventListener('change', updateCompactNavigation);
  }, []);

  useEffect(() => {
    const wasOpen = previousMenuOpen.current;
    if (compactNavigation && menuOpen && !wasOpen)
      firstMenuLink.current?.focus();
    else if (compactNavigation && !menuOpen && wasOpen)
      menuButton.current?.focus();
    else if (
      compactNavigation &&
      !menuOpen &&
      sidebar.current?.contains(document.activeElement)
    )
      menuButton.current?.focus();
    previousMenuOpen.current = menuOpen;
  }, [compactNavigation, menuOpen]);

  useEffect(() => {
    if (!compactNavigation || !menuOpen) return;

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        menuButton.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusOutsideMenu = !sidebar.current?.contains(
        document.activeElement,
      );
      if (
        event.shiftKey &&
        (document.activeElement === first || focusOutsideMenu)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || focusOutsideMenu)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleMenuKeyDown);
    return () => document.removeEventListener('keydown', handleMenuKeyDown);
  }, [compactNavigation, menuOpen]);

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
    if (!sessionUser && location.route !== 'login')
      window.location.hash = '#/login';
    else if (sessionUser && location.route === 'login')
      window.location.hash = '#/campaigns';
  }, [location.route, sessionUser]);

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

  function saveCampaignContext(
    id: string,
    details: CampaignContextDetails,
  ): boolean {
    try {
      setData(updateCampaignContext(repository, data, id, details));
      setFeedback('Saved campaign details.');
      setError(null);
      return true;
    } catch {
      setError(
        'Campaign details could not be saved. Check browser storage and try again.',
      );
      return false;
    }
  }

  function savePartyName(campaignId: string, name: string): boolean {
    try {
      const hadParty = Boolean(
        data.campaigns.find((campaign) => campaign.id === campaignId)
          ?.partyName,
      );
      setData(savePartyNameService(repository, data, campaignId, name));
      setFeedback(hadParty ? 'Saved the party name.' : 'Created the party.');
      setError(null);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Party could not be saved.',
      );
      return false;
    }
  }

  function changePartyMembership(
    campaignId: string,
    characterId: string,
    add: boolean,
  ): boolean {
    if (!sessionUser) return false;
    try {
      const character = data.characters.find(
        (item) => item.id === characterId && item.campaignId === campaignId,
      );
      if (!character) throw new Error('Character not found in this campaign.');
      const next = add
        ? addPartyMember(
            repository,
            data,
            campaignId,
            characterId,
            sessionUser.id,
          )
        : removePartyMember(
            repository,
            data,
            campaignId,
            characterId,
            sessionUser.id,
          );
      setData(next);
      setFeedback(
        add
          ? `Added ${character.name} to the party.`
          : `Removed ${character.name} from the party.`,
      );
      setError(null);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Party membership could not be changed.',
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

  function signIn(user: DemoUser) {
    if (!writeDemoSession(user.id)) {
      setAuthError(
        'Browser session storage is unavailable. Sign-in cannot be retained.',
      );
      return;
    }
    setAuthError(null);
    setSessionUser(user);
    setError(null);
    setFeedback(null);
    window.location.hash = '#/campaigns';
  }

  function signOut() {
    if (navigationGuard.current && !navigationGuard.current()) return;
    const cleared = clearDemoSession();
    setAuthError(
      cleared
        ? null
        : 'The browser could not clear the demo session. Close this tab to end it.',
    );
    setSessionUser(null);
    setCharacterImport(null);
    setError(null);
    setFeedback(null);
    setMenuOpen(false);
    window.location.hash = '#/login';
  }

  function saveSheet(character: Character): boolean {
    if (!sessionUser) return false;
    try {
      let next = saveCharacter(repository, data, character, sessionUser.id);
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
      if (!sessionUser) return false;
      const character = parseCharacterImport(source, campaignId, {
        ownerUserId: sessionUser.id,
      });
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
      setError('Choose a character JSON file up to 1 MB.');
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
    if (!sessionUser) return;
    if (!window.confirm(`Delete “${character.name}”? This cannot be undone.`))
      return;
    try {
      let next = deleteCharacter(
        repository,
        data,
        character.campaignId,
        character.id,
        sessionUser.id,
      );
      const fallback = selectedCharacterId(
        next,
        character.campaignId,
        sessionUser.id,
      );
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

  if (!sessionUser)
    return (
      <NavigationGuardContext.Provider value={registerGuard}>
        <LoginScreen onSignIn={signIn} storageError={authError} />
      </NavigationGuardContext.Provider>
    );

  return (
    <NavigationGuardContext.Provider value={registerGuard}>
      <div className="app-shell">
        {menuOpen && (
          <button
            type="button"
            className="mobile-scrim"
            aria-label="Close navigation"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          ref={sidebar}
          id="primary-navigation"
          className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
          role={compactNavigation && menuOpen ? 'dialog' : undefined}
          aria-modal={compactNavigation && menuOpen ? true : undefined}
          aria-label="Application navigation"
          aria-hidden={compactNavigation && !menuOpen}
          inert={compactNavigation && !menuOpen}
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
                <small>{activeCampaign.partyName ?? 'No party created'}</small>
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
                  ref={item.route === 'campaigns' ? firstMenuLink : undefined}
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
                aria-controls="primary-navigation"
                ref={menuButton}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span />
                <span />
                <span />
              </button>
              <div className="topbar-context">
                <span className="topbar-page">
                  {navigation.find((item) => item.route === route)?.label ??
                    'Campaign library'}
                </span>
                {activeCampaign && (
                  <span className="topbar-campaign">{activeCampaign.name}</span>
                )}
              </div>
            </div>
            <div className="topbar-actions">
              <span className="account-name">{sessionUser.displayName}</span>
              <button
                type="button"
                className="account-logout"
                onClick={signOut}
              >
                Sign out
              </button>
              <button
                type="button"
                className="dice-trigger"
                ref={diceTrigger}
                onClick={openDice}
              >
                <span aria-hidden="true">d20</span> Dice roller
              </button>
            </div>
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
                viewerUserId={sessionUser.id}
                onUpdateContext={(details) =>
                  saveCampaignContext(activeCampaign.id, details)
                }
                error={error}
                feedback={feedback}
              />
            )}
            {activeCampaign && route === 'party' && (
              <PartyWorkspace
                key={activeCampaign.id}
                campaign={activeCampaign}
                characters={characters}
                viewerUserId={sessionUser.id}
                onSavePartyName={(name) =>
                  savePartyName(activeCampaign.id, name)
                }
                onAddMember={(characterId) =>
                  changePartyMembership(activeCampaign.id, characterId, true)
                }
                onRemoveMember={(characterId) =>
                  changePartyMembership(activeCampaign.id, characterId, false)
                }
                error={error}
                feedback={feedback}
              />
            )}
            {activeCampaign && route === 'characters' && (
              <CharacterWorkspace
                key={activeCampaign.id}
                campaign={activeCampaign}
                characters={characters}
                viewerUserId={sessionUser.id}
                draftKind={
                  location.characterId === 'new'
                    ? 'new'
                    : location.characterId === 'import'
                      ? 'import'
                      : null
                }
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
                    character={newCharacter(activeCampaign.id, sessionUser.id)}
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
                  (() => {
                    const character = characters.find(
                      (candidate) =>
                        candidate.id ===
                        (location.characterId ?? preferredCharacterId),
                    )!;
                    const isOwner = character.ownerUserId === sessionUser.id;
                    return (
                      <CharacterSheetPreview
                        key={character.id}
                        campaign={activeCampaign}
                        character={character}
                        readOnly={!isOwner}
                        ownerName={
                          demoUserById(character.ownerUserId)?.displayName
                        }
                        onSave={isOwner ? saveSheet : undefined}
                        onDelete={isOwner ? confirmCharacterDelete : undefined}
                        onExport={exportCharacter}
                        error={error}
                        feedback={feedback}
                      />
                    );
                  })()
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
