# Graph Report - trello  (2026-09-02)

## Corpus Check
- 300 files · ~298,559 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2353 nodes · 5124 edges · 149 communities (126 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3a694b36`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- Input Validation Schemas
- schema/index.ts
- organizations/service.ts
- Mobile API Client
- input.tsx
- dashboard/src/App.tsx
- dashboard/src/lib/api.ts
- button.tsx
- Project Tooling Config
- cards/service.ts
- Workspaces.tsx
- billing/service.ts
- BoardView.tsx
- Dashboard Node Config
- auth/service.ts
- backend/src/index.ts
- TaskDetailView.tsx
- seed.ts
- reports.test.ts
- paths
- db/index.ts
- UI Registry Config
- compilerOptions
- Mobile App Manifest
- super-admin/src/App.tsx
- compilerOptions
- TypeScript Base Configs
- enums/index.ts
- developer/service.ts
- Log
- Mobile Dependencies
- Linting and Formatting Config
- Turbo Monorepo Config
- dependencies
- TypeScript Compiler Options
- notifications/service.ts
- dependencies
- devDependencies
- dependencies
- peerDependencies
- boards/routes.ts
- Enterprise Trello-Like App — Full Architecture
- 🔍 Detailed Defect Breakdown & Reproduction Steps
- Stage and Workflow Service
- Build Output Exclusions
- Shared Types Package
- Document Management Service
- trash/routes.ts
- exports
- Database and Dev Scripts
- Form Submission Service
- Phase Management Service
- Backend TypeScript Config
- Member Selection Components
- Test Data Factories
- Project Tech Stack — Boardly
- DESIGN_TOKENS.md — Boardly Design System
- scripts
- emailTemplates.ts
- projects/service.ts
- typescript
- devDependencies
- PROGRESS.md — Boardly Project State
- Users.tsx
- Dashboard Package Config
- Super Admin Package Config
- Prettier Formatter Config
- Oxlint Linter Config
- react-dom
- Global TypeScript Options
- List Management Service
- mobile/package.json
- Entries
- Session: 2026-08-26 — Comprehensive Monorepo End-to-End (E2E) Testing Audit
- Mobile TypeScript Config
- Super Admin TS Config
- Organization Role Enums
- Shared Types TS Config
- SCAFFOLD.md — Phase 0 Bootstrap Guide
- Dashboard TS Config
- Board Role Enums
- Notification Frequency Enums
- Phase Status Enums
- DATABASE_SCHEMA.md — Boardly Drizzle ORM Schema Reference
- Project Status Enums
- Sprint Type Enums
- Stage Category Enums
- Build Artifact Paths
- AGENTS.md — Boardly
- Database Test Client
- Date Utility Library
- Icon Library
- State Management Library
- PROMPT_PATTERNS.md — AI Prompt Guide for Boardly
- Member Status Enums
- ROADMAP.md — Boardly Task List
- 🛠️ Key Features to Test
- Animation CSS Library
- Permission Keys
- @boardly/ui/card
- @boardly/ui/confirm-dialog
- env.ts
- sendEmail
- @boardly/ui/sidebar
- GLOSSARY.md — Boardly Domain Terms
- 7. List & Card Layer
- billing.test.ts
- Development Scripts
- System Diagnostic Scripts
- Development Cache Management
- 1. Platform / Auth Layer
- Current State
- SubscriptionStatus
- AI Coding Assistant Guidelines (Boardly)
- 10. Sprints & Phases
- 8. Card Content
- Dashboard Build Config
- Admin Build Config
- DevOps and CI/CD
- ProjectMemberRole
- tailwind-merge
- 3. RBAC
- 6. Board Layer
- Configuration Presets
- Database Management Scripts
- Project Setup Scripts
- Service Stop Scripts
- dashboard/tsconfig.app.json
- lib
- Marketing Visual Assets
- types
- 12. Notifications
- 13. Activity & Audit
- 14. Automations & Webhooks
- 15. Docs & Wiki
- 16. Intake Forms & SLAs
- Core Application Branding
- 19. Marketplace Apps & Power-Ups
- 2. Billing
- 4. Workspace Layer
- 5. Project Layer
- @boardly/ui/avatar
- @boardly/ui/dialog
- @boardly/ui/enterprise-data-grid
- @boardly/ui/label
- CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `cn()` - 64 edges
2. `Log` - 59 edges
3. `Button()` - 57 edges
4. `Database` - 52 edges
5. `useAuthStore` - 50 edges
6. `HttpError` - 44 edges
7. `handleRouteError()` - 44 edges
8. `db` - 36 edges
9. `cardRoutes` - 34 edges
10. `Input()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `AdminSidebar()` --calls--> `useSidebar()`  [EXTRACTED]
  apps/dashboard/src/layouts/AdminLayout.tsx → packages/ui/src/components/sidebar.tsx
- `CI Workflow` --references--> `Docker Infrastructure`  [INFERRED]
  .github/workflows/ci.yml → docker-compose.yml
- `hardDeleteBoard()` --calls--> `HttpError`  [EXTRACTED]
  apps/backend/src/modules/boards/service.ts → apps/backend/src/lib/errors.ts
- `AppSidebar()` --calls--> `useSidebar()`  [EXTRACTED]
  apps/dashboard/src/components/AppSidebar.tsx → packages/ui/src/components/sidebar.tsx
- `ThemeToggle()` --calls--> `cn()`  [EXTRACTED]
  apps/dashboard/src/components/ThemeToggle.tsx → packages/ui/src/utils.ts

## Import Cycles
- None detected.

## Communities (149 total, 21 thin omitted)

### Community 0 - "cn"
Cohesion: 0.08
Nodes (56): AppearanceModal(), AppearanceModalProps, AppSidebar(), AppSidebarProps, ThemeToggle(), ThemeToggleProps, UserProfileDropdown(), UserProfileDropdownProps (+48 more)

### Community 1 - "Input Validation Schemas"
Cohesion: 0.03
Nodes (63): AttachLabelInput, AttachLabelSchema, BulkInviteMemberSchema, CreateAttachmentInput, CreateAttachmentSchema, CreateBoardInput, CreateBoardSchema, CreateCardInput (+55 more)

### Community 2 - "schema/index.ts"
Cohesion: 0.07
Nodes (59): activityLog, apiKeys, attachments, automations, boardMemberRoleEnum, boardMembers, boards, cardAssignees (+51 more)

### Community 3 - "organizations/service.ts"
Cohesion: 0.21
Nodes (23): renderAccountDeactivatedEmail(), renderAccountReactivatedEmail(), inviteRoutes, orgRoutes, acceptInvitation(), ALLOWED_ORG_ROLES, AllowedOrgRole, bulkInviteMembers() (+15 more)

### Community 4 - "Mobile API Client"
Cohesion: 0.08
Nodes (37): App(), queryClient, styles, addCardComment(), api, API_BASE_URL, createCard(), getBoardLists() (+29 more)

### Community 5 - "input.tsx"
Cohesion: 0.09
Nodes (24): SearchItem, SearchPalette(), useDebounceValue(), api, getGoogleAuthUrl(), getPublicForm(), getWorkOSSSOAuthUrl(), submitPublicForm() (+16 more)

### Community 6 - "dashboard/src/App.tsx"
Cohesion: 0.07
Nodes (38): App(), ProtectedRoute(), useRealtimeBoard(), AdminLayout(), createWebhook(), deleteWebhook(), exchangeWorkOSCode(), getNotificationPreferences() (+30 more)

### Community 7 - "dashboard/src/lib/api.ts"
Cohesion: 0.09
Nodes (37): CreateDocumentModal(), NotificationDropdown(), createDoc(), createRole(), deleteDoc(), deleteRole(), getDoc(), getMarketplaceApps() (+29 more)

### Community 8 - "button.tsx"
Cohesion: 0.09
Nodes (42): AutomationsModalProps, ImportModal(), ImportModalProps, CreateDocumentModalProps, DocTemplate, TEMPLATES, TrashBinModal(), TrashBinModalProps (+34 more)

### Community 9 - "Project Tooling Config"
Cohesion: 0.05
Nodes (44): husky, lint-staged, devDependencies, husky, lint-staged, prettier, turbo, engines (+36 more)

### Community 10 - "cards/service.ts"
Cohesion: 0.16
Nodes (40): HttpError, generatePresignedUploadUrl(), setupAutomationEngine(), cardRoutes, addParticipantToCard(), archiveCard(), assignUserToCard(), attachLabelToCard() (+32 more)

### Community 11 - "Workspaces.tsx"
Cohesion: 0.10
Nodes (14): Integration, IntegrationProvider, Integrations(), PROVIDERS, ProjectSprints(), Workspaces(), Card(), CardAction() (+6 more)

### Community 12 - "billing/service.ts"
Cohesion: 0.15
Nodes (28): billingEvents, invitations, seatChangeRequests, renderPaymentFailedEmail(), renderSubscriptionActivatedEmail(), constructWebhookEvent(), createBillingPortalSession(), CreateCheckoutOptions (+20 more)

### Community 13 - "BoardView.tsx"
Cohesion: 0.12
Nodes (13): AutomationsModal(), FormBuilderModal(), FormBuilderModalProps, PresenceAvatars(), PresenceAvatarsProps, PresenceUser, createIntakeForm(), deleteIntakeForm() (+5 more)

### Community 14 - "Dashboard Node Config"
Cohesion: 0.05
Nodes (37): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+29 more)

### Community 15 - "auth/service.ts"
Cohesion: 0.09
Nodes (53): organizationMembers, organizations, plans, refreshTokens, ssoConfigurations, subscriptions, users, requirePlatformAdmin() (+45 more)

### Community 16 - "backend/src/index.ts"
Cohesion: 0.08
Nodes (45): db, integrations, webhooks, allowedOrigins, App, isAllowedOrigin(), formatErrorResponse(), handleRouteError() (+37 more)

### Community 17 - "TaskDetailView.tsx"
Cohesion: 0.07
Nodes (36): CardModal(), BoardLabel, LabelPicker(), LabelPickerProps, PRESET_LABEL_COLORS, ShareTaskModal(), ShareTaskModalProps, TaskDetailView (+28 more)

### Community 18 - "seed.ts"
Cohesion: 0.08
Nodes (35): assignPerm(), client, db, getPermId(), permissions, rolePermissions, roles, adminExclude (+27 more)

### Community 19 - "reports.test.ts"
Cohesion: 0.24
Nodes (21): cardSprints, sprints, reportsRoutes, getBoardSummaryReport(), getCumulativeFlowDiagram(), getLeadAndCycleTime(), getProjectSummaryReport(), getProjectVelocity() (+13 more)

### Community 20 - "paths"
Cohesion: 0.13
Nodes (15): paths, @boardly/ui, @boardly/ui/button, @boardly/ui/dropdown-menu, @boardly/ui/input, @boardly/ui/searchable-select, @boardly/ui/switch, @boardly/ui/utils (+7 more)

### Community 21 - "db/index.ts"
Cohesion: 0.21
Nodes (13): Database, queryClient, auditLog, savedSearches, auditRoutes, getAuditLogs(), recordAuditLog(), searchRoutes (+5 more)

### Community 22 - "UI Registry Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 23 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, ignoreDeprecations, jsx, module, moduleDetection (+8 more)

### Community 24 - "Mobile App Manifest"
Cohesion: 0.09
Nodes (21): backgroundColor, foregroundImage, adaptiveIcon, package, expo, android, icon, ios (+13 more)

### Community 25 - "super-admin/src/App.tsx"
Cohesion: 0.17
Nodes (13): App(), ProtectedRoute(), SuperAdminLayout(), api, queryClient, Login(), NotFound(), Overview() (+5 more)

### Community 26 - "compilerOptions"
Cohesion: 0.05
Nodes (36): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module (+28 more)

### Community 27 - "TypeScript Base Configs"
Cohesion: 0.09
Nodes (20): compilerOptions, allowSyntheticDefaultImports, lib, module, moduleResolution, target, extends, ./base.json (+12 more)

### Community 28 - "enums/index.ts"
Cohesion: 0.10
Nodes (19): NotificationChannel, Email, InApp, Push, PlanTier, Business, Enterprise, Free (+11 more)

### Community 29 - "developer/service.ts"
Cohesion: 0.34
Nodes (15): requirePermission(), developerRoutes, generateApiKey(), getMarketplaceApp(), hashKey(), httpError(), installMarketplaceApp(), listApiKeys() (+7 more)

### Community 30 - "Log"
Cohesion: 0.03
Nodes (59): 2026-08-10 — Session 10 (Sprints), 2026-08-10 — Session 11 (Phases), 2026-08-10 — Session 12 (Global Search & Saved Searches), 2026-08-10 — Session 13 (Notifications Engine Maturity), 2026-08-10 — Session 14 (Automations & Webhooks), 2026-08-10 — Session 15 (Core Integrations), 2026-08-10 — Session 1 (Phase 0 Scaffold), 2026-08-10 — Session 2 (Phase 1 MVP Core Loop) (+51 more)

### Community 31 - "Mobile Dependencies"
Cohesion: 0.10
Nodes (21): @tanstack/react-query, dependencies, axios, clsx, expo, expo-status-bar, lucide-react-native, react (+13 more)

### Community 32 - "Linting and Formatting Config"
Cohesion: 0.10
Nodes (20): eslint-plugin-import, devDependencies, eslint, eslint-plugin-import, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, exports (+12 more)

### Community 33 - "Turbo Monorepo Config"
Cohesion: 0.11
Nodes (20): ^build, .env*, $TURBO_DEFAULT$, dependsOn, inputs, cache, dependsOn, $schema (+12 more)

### Community 34 - "dependencies"
Cohesion: 0.04
Nodes (47): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @boardly/shared-types, drizzle-orm, elysia, @elysiajs/bearer, @elysiajs/cors (+39 more)

### Community 35 - "TypeScript Compiler Options"
Cohesion: 0.11
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib, module (+11 more)

### Community 36 - "notifications/service.ts"
Cohesion: 0.25
Nodes (15): notificationPreferences, notifications, pushDevices, processNotificationDigests(), notificationRoutes, dispatchPushNotification(), getPreferences(), getUserPushDevices() (+7 more)

### Community 37 - "dependencies"
Cohesion: 0.10
Nodes (21): @boardly/ui, @fontsource-variable/geist, react-router-dom, @tailwindcss/vite, @boardly/ui, @fontsource-variable/geist, react-router-dom, @tailwindcss/vite (+13 more)

### Community 38 - "devDependencies"
Cohesion: 0.12
Nodes (20): @types/node, @types/node, devDependencies, oxlint, @types/node, @types/react, vite, @vitejs/plugin-react (+12 more)

### Community 39 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, axios, clsx, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, react, shadcn (+12 more)

### Community 40 - "peerDependencies"
Cohesion: 0.15
Nodes (13): @base-ui/react, class-variance-authority, @base-ui/react, class-variance-authority, @base-ui/react, class-variance-authority, clsx, react (+5 more)

### Community 41 - "boards/routes.ts"
Cohesion: 0.33
Nodes (11): boardRoutes, archiveBoard(), createBoard(), deleteBoard(), getBoard(), listBoards(), updateBoard(), createBoardLabel() (+3 more)

### Community 42 - "Enterprise Trello-Like App — Full Architecture"
Cohesion: 0.06
Nodes (35): 10. Making It Easy to Customize, 11.1 Reporting & Dashboards, 11.2 Global + Saved Search / Advanced Query Language, 11.3 Time Tracking, 11.4 Forms / Intake (Service-Desk style), 11.5 Real-Time Collaboration Polish, 11.6 Notifications Engine Maturity, 11.7 Docs/Wiki Module (+27 more)

### Community 43 - "🔍 Detailed Defect Breakdown & Reproduction Steps"
Cohesion: 0.06
Nodes (33): 1. 🛡️ Authentication & Access Controls, 2. 🗄️ Organization Administration & Governance, 3. 📋 Kanban Board & Card Management, 4. ⚡ Productivity & Search, Boardly End-to-End (E2E) Comprehensive Testing & Defect Report, 🔴 BUG-01: Organization Router `.use()` Middleware Leak (RBAC Test Failures), 🟠 BUG-02: `tsconfig.app.json` Deprecated `baseUrl` Option Fails Production Build, 🟠 BUG-03: Missing 404 Catch-All Route Displays Blank Dark Screen (+25 more)

### Community 44 - "Stage and Workflow Service"
Cohesion: 0.39
Nodes (12): stages, stageTemplates, stageRoutes, createStage(), createStageTemplate(), deleteStage(), deleteStageTemplate(), getStageTemplateWithStages() (+4 more)

### Community 45 - "Build Output Exclusions"
Cohesion: 0.14
Nodes (14): exclude, dist, exclude, node_modules, exclude, dist, $schema, exclude (+6 more)

### Community 46 - "Shared Types Package"
Cohesion: 0.13
Nodes (14): dependencies, zod, exports, ./enums, ./permissions, ./schemas, zod, main (+6 more)

### Community 47 - "Document Management Service"
Cohesion: 0.45
Nodes (11): documentCards, docRoutes, createDocument(), deleteDocument(), generateSlug(), getDocument(), httpError(), linkCardToDocument() (+3 more)

### Community 48 - "trash/routes.ts"
Cohesion: 0.30
Nodes (11): trashRoutes, calculateDaysRemaining(), deleteBoardCascade(), deleteCardCascade(), deleteProjectCascade(), deleteWorkspaceCascade(), emptyTrash(), hardDeleteItem() (+3 more)

### Community 49 - "exports"
Cohesion: 0.11
Nodes (17): exports, ./avatar, ./button, ./card, ./confirm-dialog, ./dialog, ./dropdown-menu, ./enterprise-data-grid (+9 more)

### Community 50 - "Database and Dev Scripts"
Cohesion: 0.15
Nodes (13): scripts, db:generate, db:migrate, db:reset, db:seed, db:seed:org, db:studio, dev (+5 more)

### Community 51 - "Form Submission Service"
Cohesion: 0.46
Nodes (10): formSubmissions, formRoutes, createIntakeForm(), deleteIntakeForm(), generateSlug(), getFormsByBoard(), getPublicFormBySlug(), httpError() (+2 more)

### Community 52 - "Phase Management Service"
Cohesion: 0.49
Nodes (10): phaseRoutes, addCardToPhase(), createPhase(), deletePhase(), getPhase(), httpError(), listPhaseCards(), listPhases() (+2 more)

### Community 53 - "Backend TypeScript Config"
Cohesion: 0.15
Nodes (12): compilerOptions, noEmit, outDir, paths, rootDir, extends, include, src/**/*.ts (+4 more)

### Community 54 - "Member Selection Components"
Cohesion: 0.22
Nodes (10): AVATAR_GRADIENTS, formatRole(), getAvatarGradient(), getInitials(), getRoleBadgeClass(), MemberPicker(), MemberPickerProps, MemberRow() (+2 more)

### Community 55 - "Test Data Factories"
Cohesion: 0.33
Nodes (11): createBoard(), createBoardWithCards(), createCard(), createList(), createOrganization(), createOrgMember(), createOrgWithUsers(), createProject() (+3 more)

### Community 56 - "Project Tech Stack — Boardly"
Cohesion: 0.07
Nodes (29): 10. Summary Table (quick reference), 1. Overview, 2. Dashboard (Web App), 3. Marketing Website, 4. Mobile Apps, 5. Backend API, 6. Data & Infra Layer, 7. Monorepo Structure (recommended) (+21 more)

### Community 57 - "DESIGN_TOKENS.md — Boardly Design System"
Cohesion: 0.08
Nodes (24): 10. Tailwind Preset Structure, 1. Color Palette, 2. Typography, 3. Spacing Scale, 4. Border Radius, 5. Shadows, 6. Animation / Transitions, 7. Z-Index Scale (+16 more)

### Community 58 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, start, test, typecheck, web

### Community 59 - "emailTemplates.ts"
Cohesion: 0.10
Nodes (15): DeactivatedEmailOptions, DowngradeBlockedOptions, EnterpriseInvoiceSentOptions, formatExpiry(), GuestOverageOptions, InviteEmailOptions, PaymentFailedOptions, ReactivatedEmailOptions (+7 more)

### Community 60 - "projects/service.ts"
Cohesion: 0.26
Nodes (15): projectRoutes, createProject(), CreateProjectInput, deleteProject(), generateProjectKey(), getProject(), listProjects(), updateProject() (+7 more)

### Community 61 - "typescript"
Cohesion: 0.17
Nodes (12): typescript, @types/react-dom, typescript, @types/react-dom, devDependencies, typescript, devDependencies, @types/react (+4 more)

### Community 62 - "devDependencies"
Cohesion: 0.15
Nodes (12): devDependencies, @boardly/config, drizzle-kit, @types/bun, @types/nodemailer, name, private, version (+4 more)

### Community 63 - "PROGRESS.md — Boardly Project State"
Cohesion: 0.09
Nodes (21): 2026-08-30 — Admin Panel Invoice Interface Alignment & Full Typecheck, 2026-08-30 — Admin Panel Sidebar Responsive & Collapse State UX Fix, 2026-08-30 — Enterprise Per-Head (Per-Seat) Payment & Billing System (v2), 2026-09-02 — Top-Level Monorepo Structure & Knowledge Graph Standardization, Changes Made, Files Changed, Files Changed, Files Changed (+13 more)

### Community 64 - "Users.tsx"
Cohesion: 0.13
Nodes (16): MentionCommentBox(), MentionCommentBoxProps, MemberActivitySummary, orgService, PendingInvitation, PlatformUser, superAdminService, formatRelativeTime() (+8 more)

### Community 65 - "Dashboard Package Config"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 66 - "Super Admin Package Config"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 67 - "Prettier Formatter Config"
Cohesion: 0.20
Nodes (9): arrowParens, bracketSpacing, endOfLine, plugins, printWidth, semi, singleQuote, tabWidth (+1 more)

### Community 68 - "Oxlint Linter Config"
Cohesion: 0.22
Nodes (8): react, plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, warn

### Community 69 - "react-dom"
Cohesion: 0.33
Nodes (6): react-dom, react-dom, types, react, react-dom, react-dom

### Community 70 - "Global TypeScript Options"
Cohesion: 0.22
Nodes (9): compilerOptions, jsx, lib, module, moduleResolution, skipLibCheck, strict, DOM (+1 more)

### Community 71 - "List Management Service"
Cohesion: 0.54
Nodes (6): listRoutes, createList(), deleteList(), listLists(), updateList(), verifyBoardAccess()

### Community 72 - "mobile/package.json"
Cohesion: 0.20
Nodes (9): devDependencies, @babel/core, @types/react, typescript, main, name, private, version (+1 more)

### Community 73 - "Entries"
Cohesion: 0.11
Nodes (17): 2026-08-10 — Native Bun WebSockets vs. Redis Pub/Sub for MVP Real-Time Sync, 2026-08-16 — Integrated Docs & Wiki with Bidirectional Card Linking, 2026-08-16 — Multi-Theme & Dark Theme Customization Engine, 2026-08-16 — Native Trello & Structured Task Migration Importer, 2026-08-16 — Power-Up & Extension Marketplace Architecture, 2026-08-16 — Real-Time In-Memory Presence Registry with Automatic Disconnect Cleanup, 2026-08-16 — Stacked Area Cumulative Flow Diagrams (CFD) in Pure SVG, 2026-08-25 — DragOverlay & Real-Time Dynamic List Re-parenting for Kanban Boards (+9 more)

### Community 74 - "Session: 2026-08-26 — Comprehensive Monorepo End-to-End (E2E) Testing Audit"
Cohesion: 0.11
Nodes (18): 2026-08-26 — Session 48 (E2E Defect Resolution & Platform Stabilization), 2026-08-27 — Session 49 (Comprehensive User Management System & Cross-Company Governance), 2026-08-27 — Session 50 (Dedicated Super Admin Application Architecture Separation), 2026-08-29 — Session 51 (Database Seed Script Connection Teardown & Dev Launcher Hang Fix), 2026-08-29 — Session 52 (Super Admin Panel End-to-End Testing & Hardening), 2026-08-29 — Session 53 (Member RBAC Enum Casting Fix & Workspaces Guard), 2026-08-29 — Session 54 (Base UI nativeButton Trigger Accessibility & Console Warning Fix), 2026-08-29 — Session 55 (Sequential Number-Based Ticket ID System) (+10 more)

### Community 75 - "Mobile TypeScript Config"
Cohesion: 0.29
Nodes (6): extends, include, ../../packages/config/tsconfig/base.json, src/**/*, App.tsx, index.ts

### Community 76 - "Super Admin TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, baseUrl, ignoreDeprecations, paths, files, references

### Community 77 - "Organization Role Enums"
Cohesion: 0.29
Nodes (7): OrgMemberRole, BillingManager, Member, OrgAdmin, OrgOwner, Viewer, WorkspaceAdmin

### Community 78 - "Shared Types TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, baseUrl, outDir, extends, include, src/**/*.ts

### Community 79 - "SCAFFOLD.md — Phase 0 Bootstrap Guide"
Cohesion: 0.12
Nodes (16): 3a. `packages/config` — shared ESLint, TSConfig, Tailwind preset, 3b. `packages/shared-types` — Zod schemas, enums, permission keys, 3c. `packages/ui` — Shared UI components (web), 3d. `packages/test-fixtures` — shared factory/seeder functions, Phase 0 Definition of Done, SCAFFOLD.md — Phase 0 Bootstrap Guide, Step 10 — Verify everything boots, Step 1 — Initialize the Turborepo monorepo (+8 more)

### Community 80 - "Dashboard TS Config"
Cohesion: 0.40
Nodes (4): compilerOptions, paths, files, references

### Community 81 - "Board Role Enums"
Cohesion: 0.40
Nodes (5): BoardMemberRole, Admin, Commenter, Member, Viewer

### Community 82 - "Notification Frequency Enums"
Cohesion: 0.40
Nodes (5): NotificationFrequency, DigestDaily, DigestWeekly, Instant, Off

### Community 83 - "Phase Status Enums"
Cohesion: 0.40
Nodes (5): PhaseStatus, Active, Blocked, Completed, NotStarted

### Community 84 - "DATABASE_SCHEMA.md — Boardly Drizzle ORM Schema Reference"
Cohesion: 0.12
Nodes (15): 11. Time Tracking, 15. Card Events (for Reporting), 17. Single Sign-On (SSO) & SCIM Directory Sync, 18. Public Developer API Keys, 20. Mobile Push Devices, 9. Custom Stages, `api_keys`, `card_events` (+7 more)

### Community 85 - "Project Status Enums"
Cohesion: 0.40
Nodes (5): ProjectStatus, Active, Archived, Completed, OnHold

### Community 86 - "Sprint Type Enums"
Cohesion: 0.40
Nodes (5): SprintType, Biweekly, Custom, Monthly, Weekly

### Community 87 - "Stage Category Enums"
Cohesion: 0.40
Nodes (5): StageCategory, Blocked, Done, InProgress, NotStarted

### Community 88 - "Build Artifact Paths"
Cohesion: 0.40
Nodes (5): .next/**, !.next/cache/**, .vinxi/**, outputs, dist/**

### Community 89 - "AGENTS.md — Boardly"
Cohesion: 0.13
Nodes (14): 1. Project Summary, 2. Monorepo Layout, 3. Code Style & Conventions, 4. UI Component Libraries, 5. Backend Code Practices, 6. Testing Requirements (Test-First), 7. Security & Multi-Tenancy Non-Negotiables, 8. When Unsure (+6 more)

### Community 91 - "Date Utility Library"
Cohesion: 0.50
Nodes (4): date-fns, date-fns, date-fns, date-fns

### Community 92 - "Icon Library"
Cohesion: 0.50
Nodes (4): lucide-react, lucide-react, lucide-react, lucide-react

### Community 93 - "State Management Library"
Cohesion: 0.50
Nodes (4): zustand, zustand, zustand, zustand

### Community 94 - "PROMPT_PATTERNS.md — AI Prompt Guide for Boardly"
Cohesion: 0.13
Nodes (14): 10. Debugging a Failing Test, 11. Session End — Updating Progress Docs, 12. Common Failure Modes (and how to prevent them), 13. Useful One-Liners, 1. The Golden Rule: Give Context Upfront, 2. Starting a New Work Session, 3. Building a New Backend Module, 4. Building a New Dashboard Component (+6 more)

### Community 95 - "Member Status Enums"
Cohesion: 0.50
Nodes (4): OrgMemberStatus, Active, Deactivated, Invited

### Community 96 - "ROADMAP.md — Boardly Task List"
Cohesion: 0.13
Nodes (14): 4.1 Interactive Calendar & Time-Blocking (Motion / Cron Parity), 4.2 Team Chat & Real-Time Messaging (Slack / Discord Parity), 4.3 Bi-Directional Git & Developer Automations (Linear / GitHub Engine), 4.4 Real-Time Collaborative Multi-Cursor Docs (Notion / CRDT Parity), 4.5 Live Audio/Video Huddles & Virtual Rooms (WebRTC), 4.6 Universal Triage Inbox & Inbound Email Integration, Backlog (not yet phased — park ideas here instead of losing them), Definition of Done (applies to every item) (+6 more)

### Community 97 - "🛠️ Key Features to Test"
Cohesion: 0.14
Nodes (13): 1. Scrum & Sprints Management, 2. Kanban Drag-and-Drop & Custom Stage Workflows, 3. Time Tracking & Timesheets, 4. Card Detail Modal (Checklists, Watchers, Comments), 5. Admin Governance & RBAC, 6. User Management Lifecycle & Soft-Deactivation, 7. Dedicated Platform Super Admin Portal (`http://localhost:5174`), Acme Technologies — Enterprise Demo Credentials & Seed Catalog (+5 more)

### Community 98 - "Animation CSS Library"
Cohesion: 0.67
Nodes (3): tw-animate-css, tw-animate-css, tw-animate-css

### Community 99 - "Permission Keys"
Cohesion: 0.15
Nodes (12): Board-level, Card-level, Default Role → Permission Mapping, How to Add a New Permission, List-level, Naming Convention, Organization-level, Permission Keys (+4 more)

### Community 102 - "env.ts"
Cohesion: 0.24
Nodes (7): db, migrationsFolder, sql, urls, Env, envSchema, parsed

### Community 103 - "sendEmail"
Cohesion: 0.36
Nodes (9): getResendClient(), getSESTransport(), getSMTPTransport(), printDevModeEmail(), sendEmail(), SendEmailOptions, sendViaResend(), sendViaSES() (+1 more)

### Community 105 - "GLOSSARY.md — Boardly Domain Terms"
Cohesion: 0.25
Nodes (7): Board structure, GLOSSARY.md — Boardly Domain Terms, Other core entities, People on a card, Roles (see architecture doc §2 for the full table), Task classification — the three easily-confused concepts, Tenancy hierarchy

### Community 107 - "7. List & Card Layer"
Cohesion: 0.29
Nodes (7): 7. List & Card Layer, `card_assignees`, `card_labels`, `card_participants`, `card_watchers`, `cards`, `lists`

### Community 108 - "billing.test.ts"
Cohesion: 0.53
Nodes (4): checkAndReserveSeatSlot(), getBillingOverview(), getGuestCap(), isBillableRole()

### Community 111 - "Development Cache Management"
Cohesion: 0.67
Nodes (3): cache, persistent, dev

### Community 112 - "1. Platform / Auth Layer"
Cohesion: 0.33
Nodes (6): 1. Platform / Auth Layer, `invitations`, `organization_members`, `organizations`, `refresh_tokens`, `users`

### Community 113 - "Current State"
Cohesion: 0.33
Nodes (6): Current State, Environment / access notes, Known issues / blockers, What exists, What's explicitly NOT started, What's in progress

### Community 114 - "SubscriptionStatus"
Cohesion: 0.33
Nodes (6): SubscriptionStatus, Active, Canceled, PastDue, PastDueDowngradePending, Trialing

### Community 115 - "AI Coding Assistant Guidelines (Boardly)"
Cohesion: 0.40
Nodes (4): 1. Codebase Knowledge Graph & Navigation (MANDATORY), 2. Project Architecture & Stack, 3. Documentation Updates Rule, AI Coding Assistant Guidelines (Boardly)

### Community 116 - "10. Sprints & Phases"
Cohesion: 0.40
Nodes (5): 10. Sprints & Phases, `card_phase`, `card_sprints`, `phases`, `sprints`

### Community 117 - "8. Card Content"
Cohesion: 0.40
Nodes (5): 8. Card Content, `attachments`, `checklist_items`, `checklists`, `comments`

### Community 121 - "ProjectMemberRole"
Cohesion: 0.40
Nodes (5): ProjectMemberRole, Admin, Member, Owner, Viewer

### Community 122 - "tailwind-merge"
Cohesion: 0.50
Nodes (4): tailwind-merge, tailwind-merge, tailwind-merge, tailwind-merge

### Community 123 - "3. RBAC"
Cohesion: 0.50
Nodes (4): 3. RBAC, `permissions`, `role_permissions`, `roles`

### Community 124 - "6. Board Layer"
Cohesion: 0.50
Nodes (4): 6. Board Layer, `board_members`, `boards`, `labels`

### Community 130 - "lib"
Cohesion: 0.67
Nodes (3): lib, DOM, ES2023

### Community 133 - "types"
Cohesion: 0.67
Nodes (3): types, react-dom, vite/client

### Community 134 - "12. Notifications"
Cohesion: 0.67
Nodes (3): 12. Notifications, `notification_preferences`, `notifications`

### Community 135 - "13. Activity & Audit"
Cohesion: 0.67
Nodes (3): 13. Activity & Audit, `activity_log`, `audit_log`

### Community 136 - "14. Automations & Webhooks"
Cohesion: 0.67
Nodes (3): 14. Automations & Webhooks, `automations`, `webhooks`

### Community 137 - "15. Docs & Wiki"
Cohesion: 0.67
Nodes (3): 15. Docs & Wiki, `document_cards`, `documents`

### Community 138 - "16. Intake Forms & SLAs"
Cohesion: 0.67
Nodes (3): 16. Intake Forms & SLAs, `form_submissions`, `intake_forms`

### Community 140 - "19. Marketplace Apps & Power-Ups"
Cohesion: 0.67
Nodes (3): 19. Marketplace Apps & Power-Ups, `installed_apps`, `marketplace_apps`

### Community 141 - "2. Billing"
Cohesion: 0.67
Nodes (3): 2. Billing, `plans`, `subscriptions`

### Community 142 - "4. Workspace Layer"
Cohesion: 0.67
Nodes (3): 4. Workspace Layer, `workspace_members`, `workspaces`

### Community 143 - "5. Project Layer"
Cohesion: 0.67
Nodes (3): 5. Project Layer, `project_members`, `projects`

## Knowledge Gaps
- **1025 isolated node(s):** `1. Codebase Knowledge Graph & Navigation (MANDATORY)`, `2. Project Architecture & Stack`, `3. Documentation Updates Rule`, `AI Assistant Instructions`, `sql` (+1020 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1107 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `types` connect `types` to `button.tsx`, `compilerOptions`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `react` connect `button.tsx` to `cn`, `Users.tsx`, `types`, `dashboard/src/App.tsx`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `compilerOptions` connect `compilerOptions` to `dashboard/tsconfig.app.json`, `lib`, `paths`, `types`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `1. Codebase Knowledge Graph & Navigation (MANDATORY)`, `2. Project Architecture & Stack`, `3. Documentation Updates Rule` to the rest of the system?**
  _1025 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.07544757033248081 - nodes in this community are weakly interconnected._
- **Should `Input Validation Schemas` be split into smaller, more focused modules?**
  _Cohesion score 0.03125 - nodes in this community are weakly interconnected._
- **Should `schema/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07226107226107226 - nodes in this community are weakly interconnected._