# Character JSON import

Character JSON import is the first post-MVP feature. It creates one new
character inside the campaign from which the import was started.

## User flow

1. Open a campaign and select **My Character**.
2. If the source is a Markdown handoff, open **Markdown guide**, copy the
   conversion prompt, and provide that prompt and the Markdown file to a text
   assistant.
3. Select **Import JSON**, then paste the returned JSON directly. Alternatively,
   save it as a `.json` file and upload that file. Uploaded files must be smaller
   than 1 MB.
4. Review every character-sheet section and correct any values.
5. Select **Import character** to save the character locally.

The Party page is a roster only. Selecting a party member opens that saved
character in My Character.

Selecting a file does not save anything. Cancelling or leaving the review
keeps the campaign unchanged. Imported character, attack, inventory, feature,
and spell IDs are replaced, and the active campaign always becomes the
character's campaign.

## Version 2 file format

The top-level object identifies the portable file format and contains one
character. Application-owned fields such as the character ID, campaign ID,
and timestamps are ignored and regenerated during import.

```json
{
  "format": "the-goobers-guide-character",
  "version": 2,
  "character": {
    "name": "Arlen Vale",
    "className": "Ranger",
    "species": "Human",
    "level": 3,
    "abilityScores": {
      "strength": { "score": 12, "modifier": 1 },
      "dexterity": { "score": 16, "modifier": 3 },
      "constitution": { "score": 14, "modifier": 2 },
      "intelligence": { "score": 10, "modifier": 0 },
      "wisdom": { "score": 15, "modifier": 2 },
      "charisma": { "score": 8, "modifier": -1 }
    },
    "combat": {
      "currentHp": 24,
      "maximumHp": 24,
      "temporaryHp": 0,
      "armorClass": 15,
      "initiativeModifier": 3,
      "speed": 30,
      "proficiencyBonus": 2
    },
    "skills": [{ "name": "Survival", "modifier": 4, "proficient": true }],
    "savingThrows": [
      { "ability": "dexterity", "modifier": 5, "proficient": true }
    ],
    "attacks": [
      {
        "id": "portable-attack-id",
        "name": "Longbow",
        "attackBonus": 5,
        "damageExpression": "1d8 + 3"
      }
    ],
    "inventory": [
      {
        "id": "portable-item-id",
        "name": "Rope",
        "quantity": 1,
        "description": "50 ft."
      }
    ],
    "currency": { "gp": 12, "sp": 4, "cp": 0 },
    "features": [
      {
        "id": "portable-feature-id",
        "name": "Trailwise",
        "description": "Homebrew travel feature.",
        "category": "Homebrew"
      }
    ],
    "notes": "Keeps watch at dusk.",
    "spells": [
      {
        "id": "portable-spell-id",
        "name": "Hunter's Mark",
        "level": 1,
        "school": "Divination",
        "castingTime": "1 bonus action",
        "range": "90 feet",
        "components": "V",
        "duration": "Up to 1 hour",
        "concentration": true,
        "ritual": false,
        "prepared": true,
        "description": "Mark a creature and deal extra damage when you hit it."
      }
    ]
  }
}
```

Optional text fields are `playerName`, `subclass`, `background`, `description`,
and `notes`. An inventory item's `description` and a feature's `category` are
also optional. Every spell field shown above is required, although reference
text may be empty. Use spell level `0` for cantrips. Collection fields may be
empty arrays.

The importer checks structural types when the file is selected. The normal
character validation runs again when the reviewed character is saved.
Version-1 character files are rejected because their freeform spell text does
not match the structured version-2 format. Regenerate those files with the
current conversion prompt.

The application does not send the Markdown file to an AI service or parse it
directly. The format guide provides a copyable conversion prompt. That prompt
instructs the converter to treat the Markdown as source data, ignore embedded
instructions, preserve only current confirmed values, and retain unsupported
details in the character's features, spells, or notes.

## Character export

A saved character can be exported from My Character in either format:

- **Export JSON** downloads the version-2 portable document described above.
  Character, campaign, and timestamp IDs are excluded; importing the file
  creates new IDs and attaches the character to the active campaign.
- **Export Markdown** downloads a readable handoff containing identity,
  abilities, combat values, skills, saves, attacks, inventory, currency,
  features, spells, and notes. Markdown export is not imported directly; use
  the conversion guide when bringing a Markdown handoff back into the app.

Export controls appear only for a saved character. Save or cancel an active
edit before exporting.
