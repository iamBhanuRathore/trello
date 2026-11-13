# Boardly Documentation Index

Welcome to the Boardly documentation directory. This index defines document authority, categorizes all project documents, and routes tasks to the canonical reference.

For code-level file routing, consult `AGENTS.md` §12.

---

## 1. Authority Hierarchy

When documents conflict, truth resolves in this order:

1. **`docs/Decisions.md` (Architecture Decision Records)**: Explicit decisions, accepted risks, and intentional deviations override all snapshots and guides.
2. **Canonical Registries & Standards**:
   - `docs/DATABASE_SCHEMA.md`: Canonical database tables, columns, relations, and index definitions.
   - `docs/PERMISSIONS_MATRIX.md`: Canonical RBAC keys and default role assignments.
   - `docs/DESIGN_TOKENS.md`: Canonical color tokens, typography, and spacing scales.
   - `docs/Glossary.md`: Canonical domain terms and tenancy hierarchy.
3. **Architecture & Engineering Standards**:
   - `docs/project-tech-stack.md`: Monorepo structure, Elysia module patterns, and testing strategy.
   - `AGENTS.md` (root): Strict engineering guidelines, dialog contracts, and interaction standards.
4. **Product Maps**:
   - `docs/PROJECT_OVERVIEW.md`: Readable platform feature summary and module map.
5. **Project State & Planning**:
   - `docs/Progress.md`: Current build state, blockers, and append-only session history.
   - `docs/Roadmap.md`: Checkable task queue derived from the build order.
6. **Historical Snapshots (Informative only; superseded by current code)**:
   - `docs/project.md`: Initial design draft (partially superseded).
   - `docs/SCAFFOLD.md`: Phase 0 bootstrap instructions.
   - `docs/SECURITY_AUDIT.md`: 2026-09-28 point-in-time security audit.
   - `docs/E2E_TESTING_REPORT.md`: 2026-08-26 point-in-time defect log.
   - `docs/FULL_TEST_LOG.md`: 2026-09-26 1-hour blitz test log.
   - `docs/SEED_CREDENTIALS.md`: Demo accounts and seed catalog.

---

## 2. Document Map

| Document                     | Role          | Description                                                                 |
| ---------------------------- | ------------- | --------------------------------------------------------------------------- |
| `docs/DATABASE_SCHEMA.md`    | Canonical     | Exhaustive Drizzle schema reference; update before generating migrations    |
| `docs/Decisions.md`          | Canonical ADR | Chronological log of architecture decisions, trade-offs, and accepted risks |
| `docs/DESIGN_TOKENS.md`      | Canonical     | Tailwind v4 palette, semantic color tokens, and elevation levels            |
| `docs/E2E_TESTING_REPORT.md` | Snapshot      | Point-in-time (2026-08-26) testing report and historical bug log            |
| `docs/FULL_TEST_LOG.md`      | Snapshot      | Point-in-time (2026-09-26) 1-hour blitz test findings across all surfaces   |
| `docs/Glossary.md`           | Canonical     | Domain concepts (Org vs Workspace, Board vs List, Task vs Subtask)          |
| `docs/PERMISSIONS_MATRIX.md` | Canonical     | RBAC key registry, naming conventions, and role-to-permission grants        |
| `docs/Progress.md`           | Log           | Append-only work session logs, current state summaries, and known blockers  |
| `docs/PROJECT_OVERVIEW.md`   | Product Map   | High-level capabilities and platform feature map                            |
| `docs/project-tech-stack.md` | Architecture  | Backend API patterns, monorepo layout, and TDD testing tiers                |
| `docs/project.md`            | Snapshot      | Design-era architecture spec; superseded where it conflicts with code       |
| `docs/PROMPT_PATTERNS.md`    | Guide         | Prompt templates and context checklists for developers steering AI agents   |
| `docs/Roadmap.md`            | Task Queue    | Checkable build-order task list and definition of done                      |
| `docs/SCAFFOLD.md`           | Snapshot      | Historical Phase 0 bootstrapping guide                                      |
| `docs/SECURITY_AUDIT.md`     | Snapshot      | Historical security audit findings from 2026-09-28                          |
| `docs/SEED_CREDENTIALS.md`   | Reference     | Enterprise demo credentials and seed user catalog                           |

---

## 3. Task → Document Routing

| If your task or question is about...                              | Read this document                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Current build state / what was completed last                     | `docs/Progress.md` (top section: Current State)            |
| What task to implement next                                       | `docs/Roadmap.md` (first unchecked item in priority order) |
| Architectural trade-offs, why something was built a certain way   | `docs/Decisions.md`                                        |
| Adding or updating a database table, column, or relation          | `docs/DATABASE_SCHEMA.md`                                  |
| Adding or checking RBAC permission keys                           | `docs/PERMISSIONS_MATRIX.md`                               |
| Theme colors, dark mode tokens, spacing, typography               | `docs/DESIGN_TOKENS.md`                                    |
| Domain terminology and organizational structure                   | `docs/Glossary.md`                                         |
| Monorepo conventions, backend route/service structure, test tiers | `docs/project-tech-stack.md`                               |
| Engineering rules, file size limits, dialog contracts             | `AGENTS.md` (root)                                         |
| Crafting effective agent prompts for new modules                  | `docs/PROMPT_PATTERNS.md`                                  |
| Seed user roles and demo passwords                                | `docs/SEED_CREDENTIALS.md`                                 |

---

## 4. Session-End Documentation Checklist

Per `AGENTS.md` §3 (enforced by `scripts/check-docs.sh` in `.husky/pre-push`), every session with code changes must conclude with documentation updates:

- [ ] `docs/Progress.md`: Prepend or update `Current state — YYYY-MM-DD` and append an entry to `## Log`.
- [ ] `docs/Roadmap.md`: Check off completed items once they meet the Definition of Done.
- [ ] `docs/Decisions.md`: Append an ADR if a non-trivial technical trade-off was made.
