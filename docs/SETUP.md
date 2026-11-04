# Local setup

The Goober's Guide includes local campaign, character, and journal management. Create, edit, open, switch, and delete campaigns in the campaign library. Open **My Character** to select, create, import, edit, export, or delete a campaign character; Party is a read-only roster that links back to those saved sheets. The sheet saves to this browser's LocalStorage; current and temporary HP can be changed directly in the combat band. Full sheet edits require Save changes. Spells use structured entries in their own tab and remain manually editable for homebrew content. Campaign notes also persist locally. Open the dice roller from the top bar on any page; its recent rolls last until the page is refreshed. See [DESIGN.md](DESIGN.md) for the interface system.

Use Node.js 22.12+, 24+, or 26+ and npm. From the repository root:

| Task                 | Command                |
| -------------------- | ---------------------- |
| Install dependencies | `npm install`          |
| Run locally          | `npm run dev`          |
| Build and type-check | `npm run build`        |
| Run tests            | `npm test`             |
| Check formatting     | `npm run format:check` |
| Apply formatting     | `npm run format`       |

Open the local address printed by Vite, usually `http://localhost:5173/`.

## Foundation structure

- `src/features/` holds typed campaign, character, and note models.
- `src/shared/persistence/` contains the storage interface, validation, and LocalStorage adapter.
- `src/App.tsx` maintains campaign-aware hash navigation and the existing shell.
- `src/features/campaigns/` contains the campaign library, dashboard, and persistence-backed campaign actions.
- `src/features/characters/` contains the editable character sheet, party roster, and persistence-backed character actions.

LocalStorage is scoped to the browser profile and origin. It is not a secure or shared data store. Feature code should depend on the `AppRepository` interface, not call `window.localStorage` directly.

Schema version 3 adds the remembered My Character selection for each campaign. Version-2 data is upgraded with empty character preferences. Version-1 data is also upgraded: campaigns, notes, and non-spell character data are retained, legacy spell text is discarded, and the original payload is saved under a recovery key before the first subsequent save.
