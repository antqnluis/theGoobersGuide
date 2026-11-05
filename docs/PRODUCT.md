# The Goober's Guide
## Product Vision & Requirements

**Project:** The Goober's Guide  
**Product Type:** Dungeons & Dragons Campaign Companion  
**Target Users:** Private D&D friend groups  
**Development Stage:** Initial MVP / Local Prototype  
**Status:** Product Definition v0.1

---

## 1. Product Overview

The Goober's Guide is a centralized Dungeons & Dragons campaign companion designed to help a group of friends organize and access their campaign information through a single web application.

The application serves as a digital adventurer's handbook, allowing players to switch between campaigns, review their current party, manage their characters, document campaign events, track equipment, and roll dice during gameplay.

Rather than requiring multiple applications, spreadsheets, handwritten notes, and character sheets, The Goober's Guide aims to consolidate essential player-facing resources into one organized experience.

The application is intended to complement an existing D&D campaign, not replace its Dungeon Master or gameplay systems.

## 2. The Problem

D&D campaigns produce a considerable amount of information that players must track over time.

This information can include:

- Multiple active or completed campaigns.
- Party compositions and character relationships.
- Character statistics, abilities, equipment, and currency.
- Session notes, quests, discoveries, and important NPCs.
- Dice rolls and other gameplay-related actions.

This information is often distributed across different platforms or stored in documents that are inconvenient to access during sessions.

Additionally, the Dungeon Master may maintain campaign information privately. Players do not necessarily have access to those records, making it important to have their own independently maintained source of campaign information.

The Goober's Guide addresses these problems by providing a centralized, player-managed workspace.

## 3. Product Vision

Create an accessible and organized digital companion that allows D&D players to manage their adventures from one place.

**Core Vision:**

"One guide for every campaign, every character, and every adventure."

The application should allow users to open their preferred campaign and immediately access the information most relevant to their ongoing gameplay.

Over time, the application may evolve from a local information-management tool into a shared platform where friends can collaboratively maintain campaigns and characters.

**Primary Product Experience**: The character sheet is the centerpiece of The Goober's Guide. The campaign dashboard serves as the entry point, while character profiles are the primary interface players use during gameplay.

Navigation and interface design should prioritize immediate access to character statistics, combat information, inventory, abilities, and dice rolling.

## 4. Target Users

### Primary Users: D&D Players

Players who need a convenient way to access character statistics, inventories, campaign notes, and gameplay tools.

Their primary needs include:

- Quickly accessing character information during sessions.
- Updating their character as gameplay progresses.
- Tracking equipment, resources, and currency.
- Reviewing party members and their general information.
- Remembering important events and discoveries.
- Rolling dice without leaving the application.

### Secondary Users: Party Organizers

Members of the friend group who organize campaign details or maintain shared notes.

Their needs include:

- Creating and organizing campaigns.
- Maintaining party rosters.
- Recording major events and session summaries.
- Providing an accessible reference for other players.

### Potential Future Users: Dungeon Masters

Dungeon Masters may eventually use the application to publish approved campaign information, manage party resources, or provide campaign updates.

DM-specific tools are not required for the initial MVP.

## 5. Core Product Capabilities

### 5.1 Campaign Library

A central location displaying all campaigns available to a user.

Each campaign should maintain independent information, including its title, description, optional party, characters, and notes. Campaign creation and campaign library entries focus on the name and description; party setup happens after opening the campaign.

Users should be able to switch between campaigns without mixing data from unrelated adventures.

### 5.2 Campaign Dashboard

The main landing page within a selected campaign.

It should provide an overview of the campaign, including:

- Campaign name and description.
- Current party or group name.
- Gallery of all campaign characters with party membership, portraits, and key combat details.
- Current location or relevant campaign status, if recorded.
- Recent campaign notes.
- Shortcuts to character sheets and gameplay tools.

The dashboard should prioritize information players frequently need during sessions.

### 5.3 Party Management

A dedicated view for creating or renaming a campaign's single party and choosing which campaign characters belong to it. Characters may remain in My Character without joining the party.

Each member should have a summary displaying information such as their name, class, level, and selected combat statistics.

Selecting a party member opens their character profile.

The party roster should provide a quick understanding of who belongs to the group without requiring users to open individual character sheets. Only a character's owner can add or remove that character from the party.

### 5.4 Character Management

Each character should have an individual character sheet that organizes the information required for gameplay.

Information may include:

- Character identity and background.
- Character level, class, and species.
- Ability scores and modifiers.
- Combat statistics.
- Skills and saving throws.
- Attacks and equipment.
- Inventory and currency.
- Features, proficiencies, and spells when applicable.

Character information should be editable to reflect changes during the campaign.

The long-term goal is to support importing character information from uploaded character sheets, reducing manual data entry.

### 5.5 Campaign Notes & Journal

A player-managed information repository for recording important campaign details.

Users may document:

- Session summaries.
- Important NPCs and locations.
- Active quests and objectives.
- Discoveries and significant events.
- Miscellaneous campaign information.

All notes should belong to a specific campaign.

The initial system should emphasize simple, searchable organization rather than complicated knowledge-management features.

### 5.6 Integrated Dice Roller

A built-in gameplay utility that allows players to roll standard D&D dice directly within the application.

It should provide:

- Standard polyhedral dice.
- Multiple dice rolls.
- Numerical roll modifiers.
- Individual die results and totals.
- Recent roll history.

The dice roller should be easily accessible throughout the application.

### 5.7 Multi-Campaign Support

Campaigns are independent workspaces.

A player may participate in several campaigns, each with different characters, party members, and notes.

Switching campaigns should update the application context without carrying unrelated information between campaigns.

### 5.8 Prototype Sign-In & Character Ownership

The local prototype provides two fixed demo sign-ins so players can try the ownership flow. Each character belongs to one campaign and one demo user. A signed-in user may own multiple characters in the same campaign.

All campaign characters remain visible in My Character. The party roster shows only characters assigned to that campaign's party. A character's owner controls whether it belongs to the party and can edit or delete it; other sheets are read-only. Campaigns and notes remain shared between demo users.

This is a client-side demonstration only. It has no real authentication, secure authorization, or data protection; records remain in browser LocalStorage.

## 6. Primary User Experience

A typical user journey follows this sequence:

1. Open The Goober's Guide.
2. View the campaign library.
3. Select an existing campaign.
4. Arrive at the campaign dashboard.
5. Review campaign information and create a party when ready.
6. Create or select a character in My Character, then add it to the party if appropriate.
7. Open their character sheet.
8. Update statistics, resources, or inventory as needed.
9. Roll dice during gameplay.
10. Record important information in the campaign journal.

The application should make this process intuitive and minimize unnecessary navigation.

## 7. Information Architecture

The application will follow a campaign-centered structure.

**Application Level**
- Campaign Library
- Campaign Creation

**Campaign Level**
- Campaign Overview
- Party Roster
- Character Profiles
- Campaign Notes
- Campaign Settings

**Global Utility**
- Dice Roller

A selected campaign provides the context for most application features.

## 8. Product Design Principles

### Accessibility

Information should be easy to locate, including for players who are unfamiliar with complex D&D character-management software.

### Gameplay Efficiency

Frequently used information, including HP, AC, inventory, and dice rolls, should be accessible with minimal navigation.

### Player Ownership

Players should be able to maintain their own campaign information independently of any Dungeon Master-managed systems.

### Campaign Separation

Characters, party rosters, and notes must remain associated with their respective campaigns.
Each campaign may have one party; its roster is a subset of that campaign's characters. New characters are not party members until their owner adds them.

### Modularity

The application should be organized into independent features so that additional systems can be introduced without requiring a complete redesign.

### Visual Identity

The design should evoke a fantasy adventurer's guide while maintaining the clarity of a modern application.

Fantasy-inspired typography, subtle textures, and thematic visual elements may be used, but readability and usability should take priority over decoration.

### Rules Flexibility

The application should not assume every campaign uses identical rules, character options, or homebrew mechanics.

User-entered information should take precedence over automated assumptions.

## 9. Information Ownership & Privacy

Campaign records should be treated as player-provided information rather than authoritative Dungeon Master records.

The application must not assume access to a Dungeon Master's private files, notes, or ChatGPT project.

In the initial prototype, records are stored locally. Two fixed demo identities and client-side owner checks demonstrate character editing boundaries. They do not provide secure authentication or protect data from anyone with access to the browser or its storage.

A future shared version may support:

- Real individual user accounts and authentication.
- Campaign membership and permissions.
- Private character inventories or notes.
- Shared and personal campaign records.

These capabilities require server-side authentication and authorization and are not part of the local prototype.

## 10. Long-Term Product Opportunities

Potential future enhancements include:

**Character Sheet Importing:** Upload supported character sheets and automatically extract relevant data.

**Collaborative Campaigns:** Allow multiple users to access and update shared campaign information.

**Character Privacy:** Restrict access to individual character details while preserving a public party overview.

**Advanced Campaign Tracking:** Add quest logs, NPC directories, locations, timelines, and relationship tracking.

**Automated Character Calculations:** Support optional calculations derived from character statistics and the selected D&D ruleset.

**Enhanced Dice Rolling:** Add advantage/disadvantage, saved roll presets, and character-specific actions.

**Dungeon Master Integration:** Allow authorized DMs to publish approved campaign information or connect supported external data sources.

**Campaign Exporting:** Support portable campaign archives and backup or migration between devices.

These are potential development directions rather than commitments for the initial release.

## 11. Product Success Criteria

The product is successful when players can use it as their primary reference during gameplay.

Users should be able to:

- Find the campaign they are playing.
- Understand the current party composition.
- Access and maintain character information.
- Review campaign notes and discoveries.
- Perform common dice rolls quickly.
- Navigate between these features without disrupting gameplay.

The initial prototype should demonstrate these experiences before introducing advanced systems.

## 12. Product Statement

The Goober's Guide is not intended to automate the entire D&D experience.

It is intended to make the information surrounding that experience easier to manage, access, and maintain.

Its guiding principle is simple:

**Spend less time searching for information and more time playing the campaign.**
