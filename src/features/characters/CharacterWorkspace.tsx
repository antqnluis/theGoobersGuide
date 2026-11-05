import { useRef, useState, type ReactNode } from 'react';
import type { Campaign } from '../campaigns/model';
import { demoUserById, type DemoUserId } from '../auth/demoAuth';
import { CHARACTER_CONVERSION_PROMPT } from './characterConversionPrompt';
import type { Character } from './model';

export default function CharacterWorkspace({
  campaign,
  characters,
  viewerUserId,
  selectedCharacterId,
  draftKind,
  onImportFile,
  onImportText,
  error,
  children,
}: {
  campaign: Campaign;
  characters: Character[];
  viewerUserId: DemoUserId;
  selectedCharacterId: string | null;
  draftKind: 'new' | 'import' | null;
  onImportFile: (file: File) => Promise<boolean>;
  onImportText: (source: string) => boolean;
  error: string | null;
  children: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [formatOpen, setFormatOpen] = useState(false);
  const selectedCharacter = characters.find(
    (character) => character.id === selectedCharacterId,
  );
  const viewerName = demoUserById(viewerUserId)?.displayName ?? 'you';
  const [copyStatus, setCopyStatus] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  async function copyConversionPrompt() {
    try {
      await navigator.clipboard.writeText(CHARACTER_CONVERSION_PROMPT);
      setCopyStatus({ message: 'Conversion prompt copied.', success: true });
    } catch {
      setCopyStatus({
        message: 'Copy failed. Select the prompt text and copy it manually.',
        success: false,
      });
    }
  }

  return (
    <div className="character-workspace">
      <header className="character-workspace-header">
        <div className="character-workspace-heading">
          <p className="page-context">{campaign.name}</p>
          <h1>My Character</h1>
          <p>
            Choose a character to view, make a new one, or bring in a saved
            character file.
          </p>
        </div>
        <div className="character-selection">
          <label className="character-switcher" htmlFor="character-selection">
            Select a character
            <select
              id="character-selection"
              value={draftKind ? '' : (selectedCharacterId ?? '')}
              disabled={!characters.length}
              onChange={(event) => {
                const nextCharacterId = event.target.value;
                if (nextCharacterId)
                  window.location.hash = `#/characters/${campaign.id}/${nextCharacterId}`;
                event.currentTarget.value = draftKind
                  ? ''
                  : (selectedCharacterId ?? '');
              }}
            >
              <option value="">
                {draftKind === 'new'
                  ? 'New character draft · not saved'
                  : draftKind === 'import'
                    ? 'Import review · not saved'
                    : characters.length
                      ? 'Choose a character'
                      : 'No saved characters'}
              </option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name || 'Unnamed character'}
                  {character.ownerUserId === viewerUserId
                    ? ' (yours)'
                    : ` (${demoUserById(character.ownerUserId)?.displayName ?? 'Another player'} · read-only)`}
                </option>
              ))}
            </select>
          </label>
          <p className="character-ownership" aria-live="polite">
            {draftKind === 'new' ? (
              <>
                {`New character draft. Owner: ${viewerName}. Nothing is saved yet.`}
              </>
            ) : draftKind === 'import' ? (
              <>
                {`Import review. Owner: ${viewerName}. Save the reviewed sheet to add it to this campaign.`}
              </>
            ) : selectedCharacter?.ownerUserId === viewerUserId ? (
              <>You own this character. You can edit its sheet.</>
            ) : selectedCharacter ? (
              <>
                {`Read-only. Owner: ${demoUserById(selectedCharacter.ownerUserId)?.displayName ?? 'another player'}.`}
              </>
            ) : (
              <>Your characters and other players&apos; sheets appear here.</>
            )}
          </p>
        </div>
      </header>
      <div
        className="character-workspace-actions"
        role="group"
        aria-label="Character entry actions"
      >
        <a
          className="button button-primary character-create-action"
          href={`#/characters/${campaign.id}/new`}
        >
          Create character
        </a>
        <div className="character-workspace-secondary-actions">
          <button
            className="button button-quiet"
            type="button"
            aria-expanded={importOpen}
            aria-controls="character-json-import"
            onClick={() => {
              setImportOpen((open) => !open);
              setFormatOpen(false);
              setCopyStatus(null);
            }}
          >
            Import JSON
          </button>
          <button
            className="button button-quiet"
            type="button"
            aria-expanded={formatOpen}
            aria-controls="character-format-guide"
            onClick={() => {
              setFormatOpen((open) => !open);
              setImportOpen(false);
              setCopyStatus(null);
            }}
          >
            Markdown guide
          </button>
        </div>
      </div>
      {error && (importOpen || formatOpen) && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {importOpen && (
        <section
          className="import-workspace"
          id="character-json-import"
          aria-labelledby="character-import-heading"
        >
          <div className="import-workspace-heading">
            <h2 id="character-import-heading">Import a character</h2>
            <p>
              Paste character JSON below or choose a saved file. Nothing is
              added until you review the sheet and choose Save character.
            </p>
          </div>
          <div className="import-options">
            <div className="import-paste-option">
              <label htmlFor="character-json-text">Paste JSON</label>
              <textarea
                id="character-json-text"
                className="import-json-text"
                rows={13}
                spellCheck={false}
                placeholder='Paste JSON beginning with { "format": "the-goobers-guide-character" ... }'
                value={pastedJson}
                onChange={(event) => setPastedJson(event.target.value)}
              />
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  if (onImportText(pastedJson)) setImportOpen(false);
                }}
              >
                Review pasted character
              </button>
            </div>
            <div className="import-file-option">
              <div>
                <strong>Upload a file</strong>
                <span>Choose a .json file smaller than 1 MB.</span>
              </div>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                Choose JSON file
              </button>
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept=".json,application/json"
                aria-label="Choose a character JSON file"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file && (await onImportFile(file))) setImportOpen(false);
                  event.target.value = '';
                }}
              />
            </div>
          </div>
        </section>
      )}
      {formatOpen && (
        <section
          className="conversion-guide"
          id="character-format-guide"
          aria-labelledby="character-format-heading"
        >
          <div className="conversion-guide-heading">
            <div>
              <h2 id="character-format-heading">
                Convert a Markdown character sheet
              </h2>
              <p>
                Copy this prompt, attach or paste the character&apos;s Markdown
                handoff, then paste the returned JSON into the importer or save
                it as a <code>.json</code> file.
              </p>
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={copyConversionPrompt}
            >
              Copy conversion prompt
            </button>
          </div>
          <textarea
            className="conversion-prompt"
            aria-label="Markdown to character JSON conversion prompt"
            readOnly
            rows={18}
            value={CHARACTER_CONVERSION_PROMPT}
            onFocus={(event) => event.currentTarget.select()}
          />
          {copyStatus && (
            <p
              className={`conversion-copy-status ${copyStatus.success ? 'is-success' : 'is-error'}`}
              role={copyStatus.success ? 'status' : 'alert'}
            >
              {copyStatus.message}
            </p>
          )}
        </section>
      )}
      <div className="character-workspace-content">{children}</div>
    </div>
  );
}
