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
  onImportFile,
  onImportText,
  error,
  children,
}: {
  campaign: Campaign;
  characters: Character[];
  viewerUserId: DemoUserId;
  selectedCharacterId: string | null;
  onImportFile: (file: File) => Promise<boolean>;
  onImportText: (source: string) => boolean;
  error: string | null;
  children: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [formatOpen, setFormatOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copyConversionPrompt() {
    try {
      await navigator.clipboard.writeText(CHARACTER_CONVERSION_PROMPT);
      setCopyStatus('Conversion prompt copied.');
    } catch {
      setCopyStatus(
        'Copy failed. Select the prompt text and copy it manually.',
      );
    }
  }

  return (
    <div className="character-workspace">
      <header className="character-workspace-header">
        <div className="character-workspace-heading">
          <p className="page-context">{campaign.name}</p>
          <h1>My Character</h1>
          <p>
            Create multiple characters for this campaign. You can edit your own;
            other players&apos; sheets are read-only.
          </p>
        </div>
        <label className="character-switcher">
          Character
          <select
            value={selectedCharacterId ?? ''}
            disabled={!characters.length}
            onChange={(event) => {
              const nextCharacterId = event.target.value;
              if (nextCharacterId)
                window.location.hash = `#/characters/${campaign.id}/${nextCharacterId}`;
              event.currentTarget.value = selectedCharacterId ?? '';
            }}
          >
            {!characters.length && (
              <option value="">No saved characters</option>
            )}
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
                {character.ownerUserId === viewerUserId
                  ? ' (yours)'
                  : ` (${demoUserById(character.ownerUserId)?.displayName ?? 'Another player'} · read-only)`}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="character-workspace-actions">
        <a
          className="button button-primary"
          href={`#/characters/${campaign.id}/new`}
        >
          Create character
        </a>
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
              Paste converted JSON directly, or choose a saved character file.
              You will review everything before it is added.
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
                Review pasted JSON
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
            <p className="conversion-copy-status" role="status">
              {copyStatus}
            </p>
          )}
        </section>
      )}
      <div className="character-workspace-content">{children}</div>
    </div>
  );
}
