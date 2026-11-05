# The Goober's Guide
## Initial MVP Scope & Requirements

**Version:** 0.1.0  
**Project Stage:** Local MVP  
**Deployment:** Not required  
**Primary Goal:** Develop a functioning local D&D campaign companion that demonstrates the application's core workflows.

---

## 1. MVP Objective

The purpose of this MVP is to validate the core experience of The Goober's Guide.

Users must be able to create and manage multiple campaigns, access individual character sheets, maintain campaign information, and roll dice from a centralized interface.

The MVP should be a functioning application rather than a static visual prototype.

It should demonstrate reliable data management, intuitive navigation, and a flexible structure for future improvements.

No cloud backend, online hosting, or multi-user synchronization is required.

The prototype includes two fixed, browser-local demo sign-ins to demonstrate per-player character editing. This mock flow is not real authentication and does not secure or encrypt browser data.

## 2. Technical Approach

The proposed technology stack is:

| Layer | Technology |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Development Server | Vite |
| Styling | Tailwind CSS |
| Persistent records | Browser LocalStorage |
| Demo sign-in session | Browser sessionStorage |
| Hosting | None; local development only |

The application should run locally through the Vite development environment.

Use reusable components, typed data models, and clear separation between UI components and data-persistence logic.

The implementation should be structured so that LocalStorage can eventually be replaced by a database or API.

Avoid unnecessary dependencies, complex state-management frameworks, or premature backend infrastructure.

## 3. Required Functional Features

### F01 — Campaign Library

**Priority:** Required

The application must provide a page for managing campaigns.

Required functionality:
- Display all saved campaigns.
- Create a new campaign.
- Open a selected campaign.
- Edit campaign details.
- Delete a campaign with confirmation.

Each campaign must contain:
- Unique identifier.
- Campaign name.
- Description (optional).
- Current location or status (optional).
- Creation and modification timestamps.

Campaign creation and library rows use only the campaign name and description. An optional party is created or renamed after opening the campaign. Current location and status remain editable campaign details in the overview.

**Acceptance Criteria:**
- Multiple campaigns can be created.
- Each campaign can be opened independently.
- Changes are saved locally.
- Refreshing the application does not erase saved campaigns.
- Deleting a campaign requires confirmation and removes its associated local records.

### F02 — Campaign Dashboard

**Priority:** Required

The campaign dashboard must provide a readable summary of a selected campaign.

Display:
- Campaign title.
- Campaign description.
- Party/group name, when created.
- Current location or status, if available.
- Summaries for all campaign characters, with party members clearly marked.
- Recent campaign notes.
- Shortcuts to main campaign features.

**Acceptance Criteria:**
- Dashboard information reflects the selected campaign.
- Changes to campaign details or characters appear on the dashboard.
- Empty campaigns display a useful empty state instead of broken or placeholder content.

### F03 — Party Roster

**Priority:** Required

Each campaign may have one party and a roster of characters assigned to it. Characters can exist in the campaign without being party members.

Each character summary should display:
- Name.
- Class.
- Level.
- Species.
- Current and maximum HP, when available.
- Armor Class, when available.

Users should be able to select a character to access its full profile.

**Acceptance Criteria:**
- A party can be created or renamed inside its campaign.
- The owner can add or remove their campaign characters from the party.
- New and imported characters are not automatically party members.
- The roster displays only assigned characters; My Character still shows every character in the campaign.
- Selecting a character opens the correct character sheet.
- Character changes are reflected in the roster.

All party characters remain visible to every signed-in demo user. Other users cannot change a character's party membership, edit its sheet, or delete it; ownership and editing behavior are defined in F04 and F09.

### F04 — Character Management

**Priority:** Required

Users must be able to create, view, edit, and delete character profiles.

The character sheet should be divided into clearly organized sections.

Each character belongs to exactly one campaign and one fixed demo user. A demo user may own multiple characters in a campaign. Characters cannot be shared across campaigns in the MVP.

All character information is manually entered and edited by users. No automatic synchronization, character-sheet parsing, or external data integration is required.

Character sheets must support quick edits to frequently changing values, particularly HP, inventory, currency, and other resources.

**A. Identity**
- Character name.
- Optional locally stored portrait (JPEG, PNG, or WebP); portraits are excluded from character exports.
- Player name (optional).
- Class.
- Subclass (optional).
- Species.
- Level.
- Background (optional).
- Character description (optional).

**B. Ability Scores**
- Strength.
- Dexterity.
- Constitution.
- Intelligence.
- Wisdom.
- Charisma.
- Corresponding modifiers.

**C. Combat Information**
- Current HP.
- Maximum HP.
- Temporary HP.
- Armor Class.
- Initiative modifier.
- Speed.
- Proficiency bonus.
- Attacks (name, attack bonus, damage expression).

**D. Skills & Saving Throws**
- Skill name.
- Skill modifier.
- Proficiency state.
- Saving throw modifier.
- Saving throw proficiency.

**E. Inventory**
- Item name.
- Quantity.
- Item description (optional).
- Currency balances.

**F. Character Features**
- Feature name.
- Description.
- Optional category.

**G. Additional Information**
- Freeform character notes.
- Optional structured spells with a name, level, school, casting time, range, components, duration, prepared state, concentration state, ritual state, and description.

The MVP should prioritize manually editable information rather than implementing a full D&D rules engine.

Ability modifiers may be calculated from ability scores, but skill bonuses, saving throws, attack bonuses, and other values should remain manually adjustable.

The character system should allow custom feature descriptions and homebrew content.

**Acceptance Criteria:**
- Characters can be created and assigned to campaigns.
- New characters and imports belong to the signed-in demo user; imported ownership data is ignored.
- Owners can edit and delete their own characters. Other users can view every sheet but cannot change or delete it.
- Multiple owned characters can exist for the same user in one campaign.
- Character information remains editable.
- Current HP can be updated without recreating a character.
- Ability scores and modifiers are displayed correctly.
- Inventory items can be added, edited, and removed.
- Character features can be maintained.
- Spells can be added, edited, removed, grouped by level, and read without parsing freeform text.
- Character records persist after refreshing the application.
- Deleting a character requires confirmation.

### F05 — Campaign Notes

**Priority:** Required

Provide a simple campaign journal for recording player-known information.

Each note must contain:
- Unique identifier.
- Associated campaign identifier.
- Title.
- Content.
- Optional category.
- Creation timestamp.
- Last-modified timestamp.

Suggested categories:
- Session Notes.
- NPCs.
- Locations.
- Quests.
- Discoveries.
- General.

Users must be able to:
- Create notes.
- View existing notes.
- Edit notes.
- Delete notes.
- Browse notes by campaign.

Notes must be independent between campaigns.

**Acceptance Criteria:**
- Notes persist after refreshing the application.
- Notes are displayed only within their associated campaign.
- Changes to note content are saved.
- Notes can be deleted with confirmation.
- Recent notes are visible from the campaign dashboard.

Advanced linked notes, relationship graphs, and automatic summarization are excluded.

### F06 — Integrated Dice Roller

**Priority:** Required

Provide a reusable dice-rolling utility that remains accessible throughout the application.

Supported dice:
- d4
- d6
- d8
- d10
- d12
- d20
- d100

Required functionality:
- Select a die type.
- Roll one or multiple dice.
- Apply a positive or negative numerical modifier.
- Display individual die results.
- Display the final total.
- Display a recent roll history.

Examples:
- 1d20
- 2d6
- 1d20 + 4
- 3d8 - 2

A dedicated dice page or panel may be provided, but users should also be able to access the roller while viewing other application sections.

**Acceptance Criteria:**
- Every supported die produces values within its valid range.
- Multiple dice contribute correctly to the final total.
- Modifiers are correctly applied.
- Individual dice and total results are visible.
- Recent results can be reviewed.
- The dice roller can be accessed without abandoning the current campaign context.

Dice rolling must operate client-side.

Roll history may be limited to the current local session.

### F07 — Local Data Persistence

**Priority:** Required

All persistent application data must be saved locally.

Use LocalStorage behind a dedicated persistence layer.

Persist:
- Campaigns.
- Characters and their associated records.
- Campaign notes.
- Relevant user preferences, if implemented.

The application should initialize safely when no saved data exists.

Data handling should include:
- Validated data structures.
- Safe handling of absent optional fields.
- Graceful behavior when saved data is missing or invalid.
- A basic schema version for future migration.
- Schema version 5 separates party membership from campaign characters; version 4 saves migrate their existing party rosters and retain the original-data backup behavior.

**Acceptance Criteria:**
- Creating or editing information saves it locally.
- Refreshing the page preserves saved records.
- Switching campaigns does not overwrite unrelated information.
- Missing or invalid stored data does not crash the application.

LocalStorage is not a secure mechanism for protecting sensitive information and must not be treated as one.

The mock sign-in stores only the fixed demo user ID in `sessionStorage`. It is a prototype UI flow, not an authorization boundary.

### F08 — Navigation & Responsive Layout

**Priority:** Required

The application must have consistent navigation between its primary sections.

Required destinations:
- Campaign Library.
- Campaign Overview.
- Party Roster.
- Character Profiles.
- Campaign Notes.
- Dice Roller.

Additional requirements:
- Display the active campaign context.
- Provide clear navigation back to the campaign library.
- Support desktop browser widths.
- Remain usable on mobile browser widths.
- Provide empty states and basic user feedback.
- Use consistent visual components.

The initial visual style should draw inspiration from fantasy adventure journals without compromising readability.

**Acceptance Criteria:**
- Users can navigate between major sections without losing data.
- Active campaign information is consistent across views.
- No essential controls are inaccessible at mobile widths.
- Empty screens provide clear actions.
- Layouts do not contain overlapping or clipped essential content.

### F09 — Prototype Sign-In & Character Ownership

**Priority:** Required for the local prototype

Provide a login screen for two fixed demo accounts: `player-one` / `demo` and `player-two` / `demo`. Display these credentials on the screen. Retain the signed-in demo user ID in `sessionStorage` until logout or tab closure, and redirect signed-out users away from application routes.

Every character record includes its owning demo user ID. A signed-in player can create, import, edit, and delete their own characters, and can add or remove their characters from the campaign party. All characters remain visible in My Character and can be opened read-only by other players. Campaigns and notes remain shared and editable by either signed-in demo user.

This feature is only for local interaction testing. It must not be described as secure authentication or data protection.

**Acceptance Criteria:**
- Correct fixed credentials open the campaign library; incorrect credentials remain on the login screen with clear feedback.
- Refresh keeps the current demo session; logout clears it; signed-out deep links return to login.
- Each demo user can own multiple characters in one campaign.
- Character creation and import assign the current demo owner, ignoring ownership values in imported data.
- UI controls and character services prevent editing or deleting another user’s character, including through a direct sheet URL.
- Other users can view those sheets as read-only, including HP and temporary HP.
- Campaigns and notes remain shared between both demo users.

## 4. Initial Data Model

The application should center on three main entities.

### Campaign

```ts
interface Campaign {
  id: string;
  name: string;
  partyName?: string;
  partyMemberCharacterIds: string[];
  description?: string;
  currentLocation?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Character

Character records must include:
- Unique ID.
- Campaign ID.
- Owner demo user ID (`player-one` or `player-two`).
- Character identity.
- Level, class, and species.
- Ability scores.
- Combat statistics.
- Skills and saves.
- Inventory and currency.
- Attacks and features.
- Optional additional notes.

Detailed types should be defined during implementation using typed, nested structures where appropriate.

### CampaignNote

```ts
interface CampaignNote {
  id: string;
  campaignId: string;
  title: string;
  content: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Data Relationship Rules:**

- One campaign can have many characters.
- A campaign can have one optional party. Its member IDs refer only to characters in that campaign.
- One campaign can have many notes.
- Every character belongs to one campaign in the initial model.
- Every character belongs to one fixed demo user; demo users are code-defined and are not stored as accounts.
- New characters start outside the party. Only the character owner may add or remove it; removing a character does not delete it.
- Every note belongs to one campaign.
- Deleting a character removes its party membership.
- Deleting a campaign removes its associated characters and notes after confirmation.
- Dice rolls do not need permanent campaign associations in the MVP.

## 5. Required User Flows

### Flow A — Create a Campaign

1. Open the campaign library.
2. Select Create Campaign.
3. Enter the campaign name and optional description.
4. Save the campaign.
5. Open its dashboard.
6. Create a party from the Party page when ready.

### Flow B — Create a Character

1. Open a campaign.
2. Navigate to My Character.
3. Select Create Character.
4. Enter character information.
5. Save the character; it remains outside the party.
6. Open Party and add the character if it should join the roster.
7. Open and edit its character sheet.

### Flow C — Manage Gameplay Resources

1. Open a character profile.
2. Review current HP and inventory.
3. Modify HP or equipment.
4. Save changes.
5. Return to the character later.
6. Confirm the updated information is preserved.

### Flow D — Record Campaign Information

1. Open the selected campaign.
2. Navigate to Notes.
3. Create a note.
4. Enter the title, category, and contents.
5. Save the note.
6. Revisit and edit it later.

### Flow E — Roll Dice

1. Open the dice roller from any main page.
2. Select the die type.
3. Set the number of dice and modifier.
4. Roll.
5. View individual results and total.
6. Review recent rolls.

### Flow F — Switch Campaigns

1. Return to the campaign library.
2. Select a different campaign.
3. View its own dashboard, roster, and notes.
4. Confirm the previous campaign's records remain independent.

### Flow G — Sign In and Manage Owned Characters

1. Sign in using either fixed demo account.
2. Open a shared campaign and inspect the party roster.
3. Create or import a character; verify it is assigned to the current demo user.
4. Sign in as the other demo user and open that character; verify the sheet is read-only.
5. Create a character as the second user, then sign back in as the first and verify the second character is also read-only.

## 6. Explicitly Out of Scope

The local prototype must not include:

- Real account registration or authentication.
- Character passwords or secure private character sections.
- Real-time synchronization between players.
- Cloud databases.
- Online deployment.
- Multiplayer dice roll broadcasting.
- Dungeon Master administration panels.
- ChatGPT or external AI integrations.
- Automatic PDF character-sheet parsing.
- Full character creation rule enforcement.
- Automatic leveling and character progression.
- Combat initiative trackers.
- Interactive battle maps.
- Automated quest management.
- Complex campaign permissions.
- Full spellcasting rules automation.
- External D&D platform integrations.

All character information remains visible within the local application. The mock owner check only hides edit and delete actions in the UI and rejects unauthorized client service calls. It does not protect LocalStorage from inspection or modification.

Do not add server authentication, secure authorization, or cloud account infrastructure at this stage.

These capabilities may be revisited after the main workflows are validated.

## 7. Optional Enhancements After Core Completion

The following may be implemented only after all required features function correctly:

- JSON backup export and import.
- Campaign cover images.
- Quick HP adjustment buttons.
- Dice advantage/disadvantage.
- Saved dice roll presets.
- Search and filtering for campaign notes.
- Additional theme customization.
- Sample campaign data for demonstrations.

Optional features must not delay core MVP completion.

## 8. Development Phases

**Phase 1 — Application Foundation**
- Initialize the React and TypeScript project.
- Configure Tailwind CSS.
- Establish application navigation.
- Implement the fixed local demo sign-in and protected application routes.
- Define core data models.
- Implement local persistence utilities.

**Phase 2 — Campaign Management**
- Create the campaign library.
- Implement campaign CRUD.
- Develop the campaign dashboard.
- Ensure campaign-specific data isolation.

**Phase 3 — Character Management**
- Build party roster.
- Create character profile views.
- Implement character editing.
- Assign character owners and enforce read-only views for other demo users.
- Add statistics, inventory, and features.
- Connect character records to campaigns.

**Phase 4 — Campaign Notes**
- Create campaign notes interface.
- Implement note CRUD.
- Add categories and recent note display.

**Phase 5 — Dice Roller**
- Implement standard dice rolling.
- Add modifiers and multiple dice.
- Display individual results and roll history.
- Make the dice roller globally accessible.

**Phase 6 — Verification & Refinement**
- Test all core user flows.
- Validate persistence and campaign isolation.
- Check responsive layouts.
- Fix functional and accessibility issues.
- Review and simplify the user experience.

## 9. Definition of Done

The MVP is complete when the following scenario works end to end:

A user opens The Goober's Guide and creates a campaign named "Journey to Asterholm" with a description. From the campaign's Party page, they create "The Bad Company."

They create a character in My Character, enter its combat statistics and inventory, and save it. The character remains outside the roster until its owner adds it to the party.

They create a campaign note describing a recent event.

They use the dice roller to roll 1d20 + 4 and view the result.

They create a second campaign with different characters and notes.

They switch between both campaigns and verify that information remains independent.

Finally, they refresh the application and confirm that all saved campaign, character, and note information remains available.

They also sign in as both fixed demo users, verify each can own and edit multiple characters in the same campaign, and verify each other's sheets remain visible but read-only.

The MVP must also:
- Launch successfully in local development.
- Have no known blocking errors in required workflows.
- Support both desktop and mobile-width layouts.
- Handle empty states and invalid inputs appropriately.
- Maintain a clear, modular code structure.
- Avoid implementing features outside the agreed scope.

## 10. Final MVP Principle

The initial version should prove one central concept:

**A player can open The Goober's Guide, select their campaign, manage their character, review campaign information, and roll dice from one application.**

Anything that does not directly support this experience should be considered for a later version.
