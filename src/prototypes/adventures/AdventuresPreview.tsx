import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import DiceRoller from '../../features/dice/DiceRoller';
import AdventureDetail from './AdventureDetail';
import AdventureForm from './AdventureForm';
import AdventureList from './AdventureList';
import { accounts, campaigns } from './fixtures';
import type { AdventureDraft } from './model';
import { readRoute, routeHash, type PreviewRoute } from './navigation';
import {
  accessibleAdventure,
  ownedCharacters,
  visibleAdventures,
} from './selectors';
import { initialState, previewReducer, type PreviewAction } from './state';

export default function AdventuresPreview() {
  const [route, setRoute] = useState(() => readRoute(window.location.hash));
  const [state, dispatch] = useReducer(
    previewReducer,
    route.campaignId,
    initialState,
  );
  const [editing, setEditing] = useState(false);
  const dirty = useRef(false);
  const routeRef = useRef(route);
  const historyIndex = useRef(0);
  const restoringHistory = useRef(false);
  const afterHistoryRestore = useRef<(() => void) | null>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const pendingDiscard = useRef<(() => void) | null>(null);
  const discardReturnFocus = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLElement>(null);
  const diceDialog = useRef<HTMLDialogElement>(null);
  const diceTrigger = useRef<HTMLButtonElement>(null);
  const activeCampaign = campaigns.find(
    (campaign) => campaign.id === state.campaignId,
  );
  const owned = ownedCharacters(state.viewerId, state.campaignId);
  const adventure = route.adventureId
    ? accessibleAdventure(state, route.adventureId)
    : undefined;
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const requestDiscard = useCallback((action: () => void) => {
    if (!dirty.current) {
      action();
      return;
    }
    if (pendingDiscard.current) return;
    discardReturnFocus.current = document.activeElement as HTMLElement | null;
    pendingDiscard.current = action;
    discardDialog.current?.showModal();
  }, []);
  function keepEditing() {
    pendingDiscard.current = null;
    discardDialog.current?.close();
    discardReturnFocus.current?.focus();
  }
  function discardDraft() {
    const action = pendingDiscard.current;
    pendingDiscard.current = null;
    dirty.current = false;
    discardDialog.current?.close();
    action?.();
  }

  const applyRoute = useCallback((next: PreviewRoute) => {
    dirty.current = false;
    setEditing(false);
    routeRef.current = next;
    setRoute(next);
    dispatch({ type: 'context', campaignId: next.campaignId });
  }, []);

  useEffect(() => {
    window.history.replaceState(
      { adventuresPreviewIndex: 0 },
      '',
      window.location.hash || routeHash(routeRef.current),
    );
    const restoreOrRead = () => {
      const next = readRoute(window.location.hash);
      const nextIndex: unknown = window.history.state?.adventuresPreviewIndex;
      if (routeHash(next) === routeHash(routeRef.current)) {
        if (typeof nextIndex === 'number') historyIndex.current = nextIndex;
        restoringHistory.current = false;
        const pending = afterHistoryRestore.current;
        afterHistoryRestore.current = null;
        pending?.();
        return;
      }
      if (restoringHistory.current) return;
      if (dirty.current) {
        if (
          typeof nextIndex === 'number' &&
          nextIndex !== historyIndex.current
        ) {
          restoringHistory.current = true;
          window.history.go(historyIndex.current - nextIndex);
          requestDiscard(() => {
            const retry = () =>
              window.history.go(nextIndex - historyIndex.current);
            if (restoringHistory.current) afterHistoryRestore.current = retry;
            else retry();
          });
        } else {
          window.history.replaceState(
            { adventuresPreviewIndex: historyIndex.current },
            '',
            routeHash(routeRef.current),
          );
          requestDiscard(() => {
            historyIndex.current += 1;
            window.history.pushState(
              { adventuresPreviewIndex: historyIndex.current },
              '',
              routeHash(next),
            );
            applyRoute(next);
          });
        }
        return;
      }
      historyIndex.current =
        typeof nextIndex === 'number' ? nextIndex : historyIndex.current + 1;
      window.history.replaceState(
        { adventuresPreviewIndex: historyIndex.current },
        '',
        routeHash(next),
      );
      applyRoute(next);
    };
    window.addEventListener('popstate', restoreOrRead);
    window.addEventListener('hashchange', restoreOrRead);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('popstate', restoreOrRead);
      window.removeEventListener('hashchange', restoreOrRead);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [applyRoute, requestDiscard]);

  useEffect(() => {
    (
      content.current?.querySelector<HTMLElement>('#adventure-title') ??
      content.current?.querySelector<HTMLElement>('h1')
    )?.focus();
  }, [route, editing, state.viewerId, state.selectedCharacterId]);

  function navigate(next: PreviewRoute, replace = false) {
    if (!replace && routeHash(next) === routeHash(routeRef.current)) return;
    requestDiscard(() => {
      if (replace)
        window.history.replaceState(
          { adventuresPreviewIndex: historyIndex.current },
          '',
          routeHash(next),
        );
      else {
        historyIndex.current += 1;
        window.history.pushState(
          { adventuresPreviewIndex: historyIndex.current },
          '',
          routeHash(next),
        );
      }
      applyRoute(next);
    });
  }
  function switchViewer(viewerId: string) {
    requestDiscard(() => {
      dirty.current = false;
      setEditing(false);
      dispatch({ type: 'context', viewerId });
    });
  }
  function switchCharacter(characterId: string) {
    requestDiscard(() => {
      dirty.current = false;
      setEditing(false);
      dispatch({ type: 'context', characterId });
    });
  }
  function save(draft: AdventureDraft, id?: string) {
    const newId = crypto.randomUUID();
    const action: PreviewAction = {
      type: 'save',
      draft,
      id,
      newId,
      campaignId: state.campaignId,
      viewerId: state.viewerId,
      now: new Date().toISOString(),
    };
    const result = previewReducer(state, action);
    dispatch(action);
    if (!result.error) {
      dirty.current = false;
      setEditing(false);
      const next: PreviewRoute = {
        ...route,
        page: 'detail',
        adventureId: id ?? newId,
        view: draft.status === 'Completed' ? 'completed' : 'active',
      };
      // Retain save feedback: route adoption here must not clear reducer feedback.
      window.history.replaceState(
        { adventuresPreviewIndex: historyIndex.current },
        '',
        routeHash(next),
      );
      routeRef.current = next;
      setRoute(next);
    }
  }
  function cancel() {
    requestDiscard(() => {
      dirty.current = false;
      if (editing) {
        setEditing(false);
        dispatch({ type: 'context' });
      } else navigate({ ...route, page: 'list', adventureId: undefined });
    });
  }
  function reset() {
    requestDiscard(() => {
      dirty.current = false;
      const next: PreviewRoute = {
        campaignId: campaigns[0].id,
        page: 'list',
        view: 'active',
      };
      navigate(next);
      dispatch({ type: 'reset', campaignId: next.campaignId });
    });
  }
  function closeDice() {
    diceDialog.current?.close();
    diceTrigger.current?.focus();
  }
  return (
    <div className="adventures-preview">
      <a
        className="ap-skip"
        href="#preview-content"
        onClick={(event) => {
          event.preventDefault();
          content.current?.focus();
        }}
      >
        Skip to Adventures
      </a>
      <header className="ap-masthead">
        <span>The Goober’s Guide</span>
        <span>A1 Adventures preview</span>
      </header>
      <aside
        className="ap-preview-tools"
        aria-labelledby="preview-controls-title"
      >
        <div className="ap-tools-heading">
          <h2 id="preview-controls-title">Preview controls</h2>
          <button onClick={reset}>Reset preview</button>
        </div>
        <p>
          Synthetic preview. Changes last until refresh. Viewer switching
          demonstrates visibility; it does not provide secure privacy.
        </p>
        <div className="ap-context-fields">
          <label>
            Viewer
            <select
              value={state.viewerId}
              onChange={(event) => switchViewer(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.role ? ` (${account.role})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Campaign
            <select
              value={activeCampaign ? state.campaignId : ''}
              onChange={(event) =>
                navigate({
                  campaignId: event.target.value,
                  page: 'list',
                  view: 'active',
                })
              }
            >
              {!activeCampaign && (
                <option value="" disabled>
                  Unavailable campaign
                </option>
              )}
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Your character
            <select
              value={state.selectedCharacterId ?? ''}
              disabled={!owned.length}
              onChange={(event) => switchCharacter(event.target.value)}
            >
              {!owned.length && <option value="">No owned character</option>}
              {owned.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                  {activeCampaign?.partyCharacterIds.includes(character.id)
                    ? ''
                    : ' (outside party)'}
                </option>
              ))}
            </select>
          </label>
          <label className="ap-failure-toggle">
            <input
              type="checkbox"
              checked={state.failNextSave}
              onChange={(event) =>
                dispatch({ type: 'failure', enabled: event.target.checked })
              }
            />
            Fail next save
          </label>
        </div>
      </aside>
      <div className="ap-workspace">
        <nav className="ap-campaign-nav" aria-label="Preview campaign">
          <div>
            <strong>{activeCampaign?.name ?? 'Unavailable campaign'}</strong>
            <p>{activeCampaign?.partyName ?? 'No party required'}</p>
          </div>
          <button
            aria-current="page"
            onClick={() =>
              navigate({ ...route, page: 'list', adventureId: undefined })
            }
          >
            Adventures
          </button>
          <button
            ref={diceTrigger}
            onClick={() => {
              diceDialog.current?.showModal();
            }}
          >
            Dice roller
          </button>
        </nav>
        <main
          id="preview-content"
          className="ap-paper"
          tabIndex={-1}
          ref={content}
        >
          {state.feedback && (
            <p role="status" className="ap-feedback">
              {state.feedback}
            </p>
          )}
          {route.page !== 'list' && (
            <button
              className="ap-back"
              onClick={() =>
                navigate({ ...route, page: 'list', adventureId: undefined })
              }
            >
              Back to Adventures
            </button>
          )}
          {!activeCampaign || (route.page === 'detail' && !adventure) ? (
            <>
              <h1 tabIndex={-1}>Adventure unavailable</h1>
              <p>This adventure is unavailable. Return to Adventures.</p>
            </>
          ) : route.page === 'list' ? (
            <AdventureList
              adventures={visibleAdventures(state)}
              view={route.view}
              canCreate={owned.length > 0}
              onView={(view) => navigate({ ...route, view })}
              onCreate={() =>
                navigate({ ...route, page: 'new', adventureId: undefined })
              }
              onOpen={(item) =>
                navigate({ ...route, page: 'detail', adventureId: item.id })
              }
            />
          ) : route.page === 'new' ? (
            <>
              <h1 tabIndex={-1}>New adventure</h1>
              <p className="ap-muted">Personal · Pending · Participants only</p>
              <p>
                Starting with{' '}
                {owned.find(
                  (character) => character.id === state.selectedCharacterId,
                )?.name ?? 'no owned character'}
                .
              </p>
              {owned.length ? (
                <AdventureForm
                  key={`${state.viewerId}/${state.campaignId}/${state.selectedCharacterId}`}
                  creating
                  error={state.error}
                  onSave={(draft) => save(draft)}
                  onCancel={cancel}
                  onDirty={setDirty}
                />
              ) : (
                <p className="ap-notice">
                  Choose a viewer with an owned character in this campaign to
                  create an adventure.
                </p>
              )}
            </>
          ) : (
            adventure &&
            (editing ? (
              <>
                <h1 tabIndex={-1}>Edit adventure</h1>
                <p className="ap-muted">
                  Participants only. Changes stay within this preview.
                </p>
                <AdventureForm
                  key={`${adventure.id}/${state.viewerId}`}
                  initial={adventure}
                  creating={false}
                  error={state.error}
                  onSave={(draft) => save(draft, adventure.id)}
                  onCancel={cancel}
                  onDirty={setDirty}
                />
              </>
            ) : (
              <AdventureDetail
                adventure={adventure}
                error={state.error}
                onEdit={() => {
                  dispatch({ type: 'context' });
                  setEditing(true);
                }}
                onStatus={() =>
                  save(
                    {
                      ...adventure,
                      status:
                        adventure.status === 'Completed'
                          ? 'In progress'
                          : 'Completed',
                    },
                    adventure.id,
                  )
                }
              />
            ))
          )}
        </main>
      </div>
      <dialog
        className="ap-discard-dialog"
        ref={discardDialog}
        aria-labelledby="discard-title"
        aria-describedby="discard-description"
        onCancel={(event) => {
          event.preventDefault();
          keepEditing();
        }}
      >
        <h2 id="discard-title">Discard your draft?</h2>
        <p id="discard-description">
          Your unsaved adventure changes will be lost.
        </p>
        <div className="ap-actions">
          <button autoFocus onClick={keepEditing}>
            Keep editing
          </button>
          <button className="ap-primary" onClick={discardDraft}>
            Discard draft
          </button>
        </div>
      </dialog>
      <dialog
        className="dice-dialog"
        ref={diceDialog}
        onCancel={(event) => {
          event.preventDefault();
          closeDice();
        }}
        onClose={() => {
          diceTrigger.current?.focus();
        }}
        aria-labelledby="dice-title"
      >
        <DiceRoller onClose={closeDice} />
      </dialog>
    </div>
  );
}
