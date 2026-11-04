import { useEffect, useMemo, useRef, useState } from 'react';
import CampaignLibrary from './features/campaigns/CampaignLibrary';
import CampaignOverview from './features/campaigns/CampaignOverview';
import {
  createCampaign,
  deleteCampaign,
  updateCampaign,
  type CampaignDetails,
} from './features/campaigns/campaignService';
import type { Campaign } from './features/campaigns/model';
import CharacterSheetPreview from './features/characters/CharacterSheetPreview';
import PartyReadOnly from './features/characters/PartyReadOnly';
import DicePreview from './features/dice/DicePreview';
import NotesReadOnly from './features/notes/NotesReadOnly';
import { LocalStorageRepository } from './shared/persistence/localStorageRepository';
import type { AppData } from './shared/persistence/model';

type Route = 'campaigns' | 'campaign' | 'party' | 'characters' | 'notes';
type Location = { route: Route; campaignId: string | null };

const navigation: { route: Route; label: string }[] = [
  { route: 'campaigns', label: 'Campaign library' },
  { route: 'campaign', label: 'Overview' },
  { route: 'party', label: 'Party' },
  { route: 'characters', label: 'Character sheets' },
  { route: 'notes', label: 'Campaign notes' },
];

function currentLocation(): Location {
  const [route, campaignId] = window.location.hash
    .replace(/^#\/?/, '')
    .split('/');
  if (
    route !== 'campaign' &&
    route !== 'party' &&
    route !== 'characters' &&
    route !== 'notes'
  ) {
    return { route: 'campaigns', campaignId: null };
  }
  return { route, campaignId: campaignId || null };
}

export default function App() {
  const repository = useMemo(
    () => new LocalStorageRepository(window.localStorage),
    [],
  );
  const [data, setData] = useState<AppData>(() => repository.load());
  const [location, setLocation] = useState<Location>(currentLocation);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const diceDialog = useRef<HTMLDialogElement>(null);

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
    const onHashChange = () => {
      setLocation(currentLocation());
      setMenuOpen(false);
      setFeedback(null);
      setError(null);
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
  }

  return (
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
          <button type="button" className="dice-trigger" onClick={openDice}>
            <span aria-hidden="true">d20</span> Dice roller
          </button>
        </header>
        <main className="workspace-main">
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
            <PartyReadOnly campaign={activeCampaign} characters={characters} />
          )}
          {activeCampaign && route === 'characters' && (
            <>
              <p className="sample-context">
                Sample character sheet preview. It is not part of{' '}
                {activeCampaign.name}; edits here do not persist.
              </p>
              <CharacterSheetPreview />
            </>
          )}
          {activeCampaign && route === 'notes' && (
            <NotesReadOnly campaign={activeCampaign} notes={notes} />
          )}
        </main>
      </div>
      <dialog
        className="dice-dialog"
        ref={diceDialog}
        onClick={(event) => {
          if (event.target === diceDialog.current) diceDialog.current?.close();
        }}
      >
        <DicePreview onClose={() => diceDialog.current?.close()} />
      </dialog>
    </div>
  );
}
