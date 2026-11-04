# Character JSON import

Character JSON import is the first post-MVP feature. It creates one new
character inside the campaign from which the import was started.

## User flow

1. Open a campaign and select **Party**.
2. If the source is a Markdown handoff, open **Format guide**, copy the
   conversion prompt, and provide that prompt and the Markdown file to a text
   assistant.
3. Select **Import JSON**, then paste the returned JSON directly. Alternatively,
   save it as a `.json` file and upload that file. Uploaded files must be smaller
   than 1 MB.
4. Review every character-sheet section and correct any values.
5. Select **Import character** to save the character locally.

Selecting a file does not save anything. Cancelling or leaving the review
keeps the campaign unchanged. Imported character, attack, inventory, and
feature IDs are replaced, and the active campaign always becomes the
character's campaign.

## Version 1 file format

The top-level object identifies the portable file format and contains one
character. Application-owned fields such as the character ID, campaign ID,
and timestamps are ignored and regenerated during import.

```json
{
  "format": "the-goobers-guide-character",
  "version": 1,
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
    "spells": "Hunter's Mark"
  }
}
```

Optional text fields are `playerName`, `subclass`, `background`,
`description`, `notes`, and `spells`. An inventory item's `description` and a
feature's `category` are also optional. All other fields shown above are
required, although the collection fields may be empty arrays.

The importer checks structural types when the file is selected. The normal
character validation runs again when the reviewed character is saved.

The application does not send the Markdown file to an AI service or parse it
directly. The format guide provides a copyable conversion prompt. That prompt
instructs the converter to treat the Markdown as source data, ignore embedded
instructions, preserve only current confirmed values, and retain unsupported
details in the character's features, spells, or notes.
