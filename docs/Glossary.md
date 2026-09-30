# GLOSSARY.md — Boardly Domain Terms

Precise, one-line definitions for every domain concept. Boardly has several similar-sounding entities (Project vs. Board, Stage vs. Phase vs. List) — this file exists to stop those from being conflated across different agent sessions. If a term isn't here, add it before using it inconsistently.

---

## Tenancy hierarchy

| Term                             | Definition                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organization (Org / Company)** | The top-level tenant. One paying customer. Everything else nests under it.                                                                                          |
| **Workspace**                    | A department/team-level grouping inside an Organization (e.g. "Marketing," "Engineering"). An Org can have many Workspaces.                                         |
| **Project**                      | A body of work inside a Workspace (e.g. "Website Redesign Q3"). Can contain multiple Boards. This is the layer most people mean when they informally say "project." |
| **Board**                        | A single Kanban-style board (Lists + Cards) inside a Project. A Project can have several Boards (e.g. "Planning," "Bugs," "Content").                               |

## Board structure

| Term        | Definition                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **List**    | A column on a Board (e.g. "To Do," "In Progress," "Done"). Represents _physical position_ on the board — this is NOT the same as Stage. |
| **Card**    | A single task/item on a Board, living inside exactly one List.                                                                          |
| **Subtask** | A Card with `parent_card_id` set — a child task under a parent Card. Max 2 levels of nesting.                                           |

## Task classification — the three easily-confused concepts

| Term       | Definition                                                                                                                                                                                            | Key distinction                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Stage**  | A company-defined, color-coded status label on a Card (e.g. "Under Testing," "Ready to Release"), independent of which List it's in. Built from a `stage_template` the company configures themselves. | NOT the same as a List column — a Card's List and Stage move independently.       |
| **Sprint** | A time-boxed iteration (weekly/monthly/custom) that a Card can be pulled into from the backlog.                                                                                                       | About TIME, not workflow state or lifecycle.                                      |
| **Phase**  | A broad project lifecycle stage (e.g. "Discovery → Design → Dev → Test → Launch") that can span multiple Sprints and Boards.                                                                          | About the PROJECT's lifecycle, broader and longer-lived than a Sprint or a Stage. |

**Rule of thumb when unsure which one applies:** List = where on the board. Stage = detailed status label. Sprint = which time-box. Phase = which lifecycle step of the whole project. A single Card can have all four simultaneously, independently.

## People on a card

| Term                   | Definition                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Assignee**           | The person(s) responsible for doing the work on a Card.                                                      |
| **Participant**        | Anyone actively involved (commented, attached a file, @mentioned) — usually auto-added by the system.        |
| **Watcher / Observer** | Someone who wants visibility but isn't doing the work — notification-only, read + comment access by default. |

## Other core entities

| Term             | Definition                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Label / Tag**  | A color-coded, board-scoped classifier on a Card. "Tag" and "Label" are used interchangeably in this project — the table is `labels`.                                                                         |
| **Epic**         | (Optional, agile-only) A parent grouping one level above Sprints and Cards, for teams using full Scrum-style hierarchy.                                                                                       |
| **Automation**   | A "when X happens, do Y" rule. Board-scoped Butler-style rules (`automations`) are legacy-kept; current engine is project-scoped WHEN/IF/THEN (`project_automation_rules`, see docs/Decisions.md 2026-09-29). |
| **Webhook**      | An outbound HTTP call fired on a domain event, configured at the Org level, for external integrations.                                                                                                        |
| **Custom Field** | An admin-defined extra field on a Card (text/number/dropdown/date), config-driven via JSON schema — not a fixed column.                                                                                       |

## Roles (see docs/PERMISSIONS_MATRIX.md for the full table)

| Term                                          | Scope                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Super Admin**                               | Platform-wide (you, the SaaS owner).                                                  |
| **Org Owner / Org Admin**                     | One Organization.                                                                     |
| **Billing Manager / Workspace Admin**         | Organization-member roles (see `OrgMemberRole` in `packages/shared-types/src/enums`). |
| **Team roles (Lead / Developer / Tester)**    | Per-org team layer used by automation pools (see docs/Decisions.md).                  |
| **Project Member**                            | One Project.                                                                          |
| **Board Admin / Member / Commenter / Viewer** | One Board.                                                                            |

---

_Add new terms here as soon as they're introduced in conversation or code — don't let a term exist only in someone's head._
