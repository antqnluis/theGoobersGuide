# Local setup

The Goober's Guide includes local campaign, character, and journal management. Create, edit, open, switch, and delete campaigns in the campaign library. Open **My Character** to select, create, import, edit, export, or delete a campaign character; Party manages an optional roster and links back to saved sheets; only owners change membership. The sheet saves to this browser's LocalStorage; current and temporary HP can be changed directly in the combat band. Full sheet edits require Save changes. Spells use structured entries in their own tab and remain manually editable for homebrew content. Campaign notes also persist locally. Open the dice roller from the top bar on any page; its recent rolls last until the page is refreshed. See [DESIGN.md](DESIGN.md) for the interface system.

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

Schema version 5 separates party membership from campaign characters. Version-4 saves migrate their roster membership; version 3 introduced remembered character selections, and version 4 introduced demo ownership. Earlier versions retain the adapter's validated recovery and original-data backup behavior. A1–A2 do not change the schema or execute migrations.

## Isolated A1–A2 Adventures preview

Run `npm run dev` and open `/adventures-preview.html` on the address printed by Vite. This separate development entry is excluded from the default production build. The normal `/` entry remains the existing local application.

Choose synthetic viewers Ari, Bea, Cato (party reader), or Dena (organizer) in Preview controls. They are independent of the two production demo sign-ins. Ari owns two characters in Lantern Coast, including one outside its party. Quiet Reach has no party, and Dena has no character there to demonstrate blocked creation. Personal and Side Adventures are participants-only; viewer filtering demonstrates UX, not secure privacy.

Create with a title, save, leave and return, edit the next step, complete, and reopen. Use Fail next save to demonstrate a retained draft and retry. Reset preview or refresh restores synthetic fixtures. Edits last only while this preview page remains loaded; newly created direct links become unavailable after refresh. No browser storage, production session, recovery key, or saved campaign is read or written. A2 adds simulated invitations and attributed updates; handoffs, party sharing, archive/restore, and deletion remain outside the preview.

Run `npm test` for behavioral and import-boundary checks, `npm run build` for type checking/build exclusion, and `npm run format:check` for formatting. See [MVP_VERIFICATION.md](MVP_VERIFICATION.md) for dated evidence and pending manual approval.

### A2 participation walkthrough

Open a private adventure as Ari, choose Moss Bell, and propose an invitation. Switch to Bea and return to the Adventures list: the invitation displays only Moss Bell and Accept/Decline. Acceptance adds that character; open the newly visible adventure to edit or post an update. Propose Wren Pike, then switch to Ari and approve as Lark Fen before Cato can receive and accept it. Each accepted character must approve separately, even when several belong to one account. The Acting character control selects the character for approvals, edits, updates, and departure.

Try rejecting a proposal, declining an invitation, canceling as its proposer, requesting removal and agreeing/refusing as the target, and confirming Leave. Membership changes cancel pending requests. Leaving revokes account access unless another owned character remains; the final accepted character cannot leave. Activity remains for the remaining participants. Fail next save applies to edits, updates, and membership actions and preserves saved state on failure. Reset preview or refresh clears all requests, updates, and membership changes. These controls demonstrate local UX only, not real invitations, multiplayer, or secure privacy.
