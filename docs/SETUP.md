# Local setup

The Goober's Guide includes local campaign management. Create, edit, open, switch, and delete campaigns in the campaign library. Campaigns persist in this browser's LocalStorage. The dashboard reads the selected campaign and shows any linked character and note records. Character and note editing are not implemented yet. The sample character sheet can be edited on the page, but changes reset when you leave or reload it. See [DESIGN.md](DESIGN.md) for the interface system.

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
- `src/features/characters/CharacterSheetPreview.tsx` contains the sample sheet and page-only edit interaction.

LocalStorage is scoped to the browser profile and origin. It is not a secure or shared data store. Feature code should depend on the `AppRepository` interface, not call `window.localStorage` directly.
