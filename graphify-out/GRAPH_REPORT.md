# Graph Report - trello  (2026-09-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1952 nodes · 4749 edges · 140 communities (108 shown, 29 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.85)
- Token cost: 4,669 input · 1,586 output

## Graph Freshness
- Built from commit: `2442fe2a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App Layout Components
- Input Validation Schemas
- Database Schema Definitions
- Email Service Provider
- Mobile API Client
- UI Components and SSO
- Auth and Dashboard Hooks
- Document and Webhook API
- Modal Dialog Components
- Project Tooling Config
- Card Management Service
- Search and Sprint Services
- Stripe Billing Integration
- Interactive UI Modals
- Dashboard Node Config
- Authentication and Membership
- Database Migration Utilities
- Task Detail Components
- Database Seeding Scripts
- Reporting and Analytics
- UI Component Library
- Audit Logging Service
- UI Registry Config
- Dashboard App Config
- Mobile App Manifest
- Super Admin Frontend
- Super Admin App Config
- TypeScript Base Configs
- Domain Enums
- Developer Marketplace API
- Error Handling and Importers
- Mobile Dependencies
- Linting and Formatting Config
- Turbo Monorepo Config
- Backend Dependencies
- TypeScript Compiler Options
- Notification Service
- Frontend Core Dependencies
- Vite Development Tooling
- Drag and Drop UI
- UI Utility Dependencies
- Board Management Service
- Theme and Appearance Management
- Webhooks and Event Bus
- Stage and Workflow Service
- Build Output Exclusions
- Shared Types Package
- Document Management Service
- Trash and Deletion Service
- UI Component Exports
- Database and Dev Scripts
- Form Submission Service
- Phase Management Service
- Backend TypeScript Config
- Member Selection Components
- Test Data Factories
- Platform Administration Service
- Role and Permission Service
- Mobile Package Config
- Workspace Management Service
- Project Management Service
- UI Type Definitions
- Database Tooling Dependencies
- Search and Saved Filters
- SSO Integration Service
- Dashboard Package Config
- Super Admin Package Config
- Prettier Formatter Config
- Oxlint Linter Config
- React Client Types
- Global TypeScript Options
- List Management Service
- React Core Types
- Test Fixtures Package
- Shared Type Dependencies
- Mobile TypeScript Config
- Super Admin TS Config
- Organization Role Enums
- Shared Types TS Config
- TypeScript Dev Dependency
- Dashboard TS Config
- Board Role Enums
- Notification Frequency Enums
- Phase Status Enums
- Subscription Plan Enums
- Project Status Enums
- Sprint Type Enums
- Stage Category Enums
- Build Artifact Paths
- Backend Package Config
- Database Test Client
- Date Utility Library
- Icon Library
- State Management Library
- Notification Channel Enums
- Member Status Enums
- Routing Library
- Tailwind Vite Plugin
- Animation CSS Library
- Button Component Path
- UI Card Component
- UI Dialog Component
- UI Dropdown Component
- UI Select Component
- UI Sidebar Component
- UI Component Library
- System Core Definitions
- Task Management Features
- Development Scripts
- System Diagnostic Scripts
- Development Cache Management
- Database ORM
- Bearer Token Authentication
- CORS Middleware
- Email Service Integration
- UUID Generation
- WorkOS Auth Integration
- Dashboard Build Config
- Admin Build Config
- DevOps and CI/CD
- Navigation and Search UI
- Billing and Notifications
- User Mentions System
- User Profile Authentication
- Configuration Presets
- Database Management Scripts
- Project Setup Scripts
- Service Stop Scripts
- Environment Setup Scripts
- Service Start Scripts
- Marketing Visual Assets
- Architecture Documentation
- Design System Tokens
- Domain Glossary
- Project Status Tracking
- Card Participant Management
- Core Application Branding

## God Nodes (most connected - your core abstractions)
1. `cn()` - 64 edges
2. `HttpError` - 57 edges
3. `Button()` - 57 edges
4. `Database` - 52 edges
5. `useAuthStore` - 50 edges
6. `handleRouteError()` - 44 edges
7. `db` - 36 edges
8. `cardRoutes` - 34 edges
9. `Input()` - 32 edges
10. `signUp()` - 29 edges

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

## Hyperedges (group relationships)
- **Task Collaboration & Mentions System** — markdowns_progress_mentioncommentbox, markdowns_progress_service_mentions, markdowns_progress_card_participants [EXTRACTED 0.90]
- **Enterprise Governance & Access Control** — markdowns_progress_profilesettings, markdowns_progress_workos_service, markdowns_progress_billing_service [EXTRACTED 0.95]
- **Project Governance & Standards** — markdowns_agents, markdowns_database_schema, markdowns_design_tokens, markdowns_permissions_matrix, markdowns_glossary [EXTRACTED 1.00]

## Communities (140 total, 29 thin omitted)

### Community 0 - "App Layout Components"
Cohesion: 0.08
Nodes (50): AppearanceModal(), AppSidebar(), AppSidebarProps, ThemeToggle(), ThemeToggleProps, UserProfileDropdown(), UserProfileDropdownProps, ADMIN_NAV_ITEMS (+42 more)

### Community 1 - "Input Validation Schemas"
Cohesion: 0.03
Nodes (63): AttachLabelInput, AttachLabelSchema, BulkInviteMemberSchema, CreateAttachmentInput, CreateAttachmentSchema, CreateBoardInput, CreateBoardSchema, CreateCardInput (+55 more)

### Community 2 - "Database Schema Definitions"
Cohesion: 0.06
Nodes (57): activityLog, attachments, billingEvents, boardMemberRoleEnum, boardMembers, boards, cardAssignees, cardEvents (+49 more)

### Community 3 - "Email Service Provider"
Cohesion: 0.07
Nodes (48): getResendClient(), getSESTransport(), getSMTPTransport(), printDevModeEmail(), sendEmail(), SendEmailOptions, sendViaResend(), sendViaSES() (+40 more)

### Community 4 - "Mobile API Client"
Cohesion: 0.08
Nodes (37): App(), queryClient, styles, addCardComment(), api, API_BASE_URL, createCard(), getBoardLists() (+29 more)

### Community 5 - "UI Components and SSO"
Cohesion: 0.10
Nodes (31): MentionCommentBoxProps, getPublicForm(), getSSOConfig(), getSSOLoginUrl(), submitPublicForm(), updateSSOConfig(), MemberActivitySummary, orgService (+23 more)

### Community 6 - "Auth and Dashboard Hooks"
Cohesion: 0.06
Nodes (39): App(), ProtectedRoute(), useRealtimeBoard(), AdminLayout(), DashboardLayout(), exchangeWorkOSCode(), getGoogleAuthUrl(), getNotificationPreferences() (+31 more)

### Community 7 - "Document and Webhook API"
Cohesion: 0.09
Nodes (39): CreateDocumentModal(), NotificationDropdown(), createDoc(), createRole(), createWebhook(), deleteDoc(), deleteRole(), deleteWebhook() (+31 more)

### Community 8 - "Modal Dialog Components"
Cohesion: 0.11
Nodes (31): AutomationsModalProps, ImportModal(), ImportModalProps, CreateDocumentModalProps, DocTemplate, TEMPLATES, TrashBinModal(), TrashBinModalProps (+23 more)

### Community 9 - "Project Tooling Config"
Cohesion: 0.05
Nodes (44): husky, lint-staged, devDependencies, husky, lint-staged, prettier, turbo, engines (+36 more)

### Community 10 - "Card Management Service"
Cohesion: 0.16
Nodes (39): generatePresignedUploadUrl(), setupAutomationEngine(), cardRoutes, addParticipantToCard(), archiveCard(), assignUserToCard(), attachLabelToCard(), cloneCard() (+31 more)

### Community 11 - "Search and Sprint Services"
Cohesion: 0.08
Nodes (22): SearchItem, SearchPalette(), useDebounceValue(), api, phasesService, searchService, sprintsService, Integration (+14 more)

### Community 12 - "Stripe Billing Integration"
Cohesion: 0.12
Nodes (34): plans, subscriptions, users, renderPaymentFailedEmail(), renderSubscriptionActivatedEmail(), constructWebhookEvent(), createBillingPortalSession(), CreateCheckoutOptions (+26 more)

### Community 13 - "Interactive UI Modals"
Cohesion: 0.08
Nodes (26): AutomationsModal(), CardModal(), FormBuilderModal(), FormBuilderModalProps, PresenceAvatars(), PresenceAvatarsProps, PresenceUser, TaskDetailViewHandle (+18 more)

### Community 14 - "Dashboard Node Config"
Cohesion: 0.05
Nodes (37): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+29 more)

### Community 15 - "Authentication and Membership"
Cohesion: 0.16
Nodes (29): organizationMembers, ssoConfigurations, signAccessToken(), validSignUp, authRoutes, acceptInvitation(), AcceptInvitationInput, changePassword() (+21 more)

### Community 16 - "Database Migration Utilities"
Cohesion: 0.09
Nodes (25): db, migrationsFolder, sql, urls, integrations, roles, allowedOrigins, App (+17 more)

### Community 17 - "Task Detail Components"
Cohesion: 0.11
Nodes (22): BoardLabel, LabelPicker(), LabelPickerProps, PRESET_LABEL_COLORS, MentionCommentBox(), ShareTaskModal(), ShareTaskModalProps, TaskDetailView (+14 more)

### Community 18 - "Database Seeding Scripts"
Cohesion: 0.11
Nodes (24): assignPerm(), client, db, getPermId(), permissions, rolePermissions, adminExclude, allSystemRoles (+16 more)

### Community 19 - "Reporting and Analytics"
Cohesion: 0.27
Nodes (19): reportsRoutes, getBoardSummaryReport(), getCumulativeFlowDiagram(), getLeadAndCycleTime(), getProjectSummaryReport(), getProjectVelocity(), getSprintBurndown(), getWorkspacePortfolioHealth() (+11 more)

### Community 20 - "UI Component Library"
Cohesion: 0.11
Nodes (23): paths, ../../packages/ui/src/components/avatar.tsx, ../../packages/ui/src/components/dialog.tsx, ../../packages/ui/src/components/enterprise-data-grid.tsx, ../../packages/ui/src/components/input.tsx, ../../packages/ui/src/components/label.tsx, ../../packages/ui/src/components/switch.tsx, ../../packages/ui/src/utils.ts (+15 more)

### Community 21 - "Audit Logging Service"
Cohesion: 0.19
Nodes (14): Database, db, queryClient, auditLog, automations, auditRoutes, getAuditLogs(), recordAuditLog() (+6 more)

### Community 22 - "UI Registry Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 23 - "Dashboard App Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, ignoreDeprecations, jsx, lib, module (+13 more)

### Community 24 - "Mobile App Manifest"
Cohesion: 0.09
Nodes (21): backgroundColor, foregroundImage, adaptiveIcon, package, expo, android, icon, ios (+13 more)

### Community 25 - "Super Admin Frontend"
Cohesion: 0.15
Nodes (15): App(), ProtectedRoute(), SuperAdminLayout(), api, queryClient, Login(), NotFound(), Overview() (+7 more)

### Community 26 - "Super Admin App Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module (+13 more)

### Community 27 - "TypeScript Base Configs"
Cohesion: 0.09
Nodes (20): compilerOptions, allowSyntheticDefaultImports, lib, module, moduleResolution, target, extends, ./base.json (+12 more)

### Community 28 - "Domain Enums"
Cohesion: 0.09
Nodes (21): ProjectMemberRole, Admin, Member, Owner, Viewer, SprintStatus, Active, Completed (+13 more)

### Community 29 - "Developer Marketplace API"
Cohesion: 0.26
Nodes (18): apiKeys, installedApps, marketplaceApps, requirePermission(), developerRoutes, generateApiKey(), getMarketplaceApp(), hashKey() (+10 more)

### Community 30 - "Error Handling and Importers"
Cohesion: 0.23
Nodes (14): formatErrorResponse(), handleRouteError(), isSensitiveDatabaseMessage(), importerRoutes, httpError(), importGenericTasks(), importTrelloBoard(), timeTrackingRoutes (+6 more)

### Community 31 - "Mobile Dependencies"
Cohesion: 0.10
Nodes (21): @tanstack/react-query, dependencies, axios, clsx, expo, expo-status-bar, lucide-react-native, react (+13 more)

### Community 32 - "Linting and Formatting Config"
Cohesion: 0.10
Nodes (20): eslint-plugin-import, devDependencies, eslint, eslint-plugin-import, typescript, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, exports (+12 more)

### Community 33 - "Turbo Monorepo Config"
Cohesion: 0.11
Nodes (20): ^build, .env*, $TURBO_DEFAULT$, dependsOn, inputs, cache, dependsOn, $schema (+12 more)

### Community 34 - "Backend Dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, elysia, @elysiajs/swagger, jose, nodemailer, postgres (+11 more)

### Community 35 - "TypeScript Compiler Options"
Cohesion: 0.11
Nodes (19): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib, module (+11 more)

### Community 36 - "Notification Service"
Cohesion: 0.27
Nodes (14): notificationPreferences, notifications, processNotificationDigests(), notificationRoutes, dispatchPushNotification(), getPreferences(), getUserPushDevices(), listNotifications() (+6 more)

### Community 37 - "Frontend Core Dependencies"
Cohesion: 0.11
Nodes (18): @boardly/ui, @fontsource-variable/geist, tailwindcss, @boardly/ui, @fontsource-variable/geist, tailwindcss, dependencies, axios (+10 more)

### Community 38 - "Vite Development Tooling"
Cohesion: 0.13
Nodes (17): @types/node, @types/node, devDependencies, oxlint, @types/node, vite, @vitejs/plugin-react, oxlint (+9 more)

### Community 39 - "Drag and Drop UI"
Cohesion: 0.12
Nodes (17): dependencies, axios, clsx, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, react, shadcn (+9 more)

### Community 40 - "UI Utility Dependencies"
Cohesion: 0.12
Nodes (17): @base-ui/react, class-variance-authority, tailwind-merge, @base-ui/react, class-variance-authority, tailwind-merge, @base-ui/react, class-variance-authority (+9 more)

### Community 41 - "Board Management Service"
Cohesion: 0.30
Nodes (13): boardRoutes, archiveBoard(), createBoard(), CreateBoardInput, deleteBoard(), getBoard(), hardDeleteBoard(), listBoards() (+5 more)

### Community 42 - "Theme and Appearance Management"
Cohesion: 0.19
Nodes (13): AppearanceModalProps, queryClient, ACCENT_PRESETS, AccentColor, applyDOMTheme(), getSystemPrefersDark(), STORAGE_KEYS, THEME_PALETTES (+5 more)

### Community 43 - "Webhooks and Event Bus"
Cohesion: 0.28
Nodes (10): organizations, webhooks, EventBus, webhookRoutes, createWebhook(), deleteWebhook(), dispatchWebhook(), listWebhooks() (+2 more)

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

### Community 48 - "Trash and Deletion Service"
Cohesion: 0.35
Nodes (12): trashRoutes, calculateDaysRemaining(), deleteBoardCascade(), deleteCardCascade(), deleteProjectCascade(), deleteWorkspaceCascade(), emptyTrash(), hardDeleteItem() (+4 more)

### Community 49 - "UI Component Exports"
Cohesion: 0.14
Nodes (14): exports, ./avatar, ./button, ./card, ./confirm-dialog, ./dialog, ./dropdown-menu, ./enterprise-data-grid (+6 more)

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

### Community 56 - "Platform Administration Service"
Cohesion: 0.42
Nodes (10): refreshTokens, superadminRoutes, forceLogoutPlatformUser(), getPlatformUser(), httpError(), listPlans(), listPlatformUsers(), listTenants() (+2 more)

### Community 57 - "Role and Permission Service"
Cohesion: 0.47
Nodes (9): roleRoutes, createCustomRole(), DEFAULT_SYSTEM_PERMISSIONS, deleteCustomRole(), ensurePermissionsSeeded(), getAvailablePermissions(), httpError(), listRoles() (+1 more)

### Community 58 - "Mobile Package Config"
Cohesion: 0.17
Nodes (11): main, name, private, scripts, android, ios, start, test (+3 more)

### Community 59 - "Workspace Management Service"
Cohesion: 0.45
Nodes (8): workspaceMembers, workspaceRoutes, createWorkspace(), CreateWorkspaceInput, deleteWorkspace(), getWorkspace(), listWorkspaces(), updateWorkspace()

### Community 60 - "Project Management Service"
Cohesion: 0.47
Nodes (8): projectRoutes, createProject(), CreateProjectInput, deleteProject(), generateProjectKey(), getProject(), listProjects(), updateProject()

### Community 61 - "UI Type Definitions"
Cohesion: 0.18
Nodes (10): @types/react-dom, @types/react-dom, devDependencies, @types/react, @types/react-dom, typescript, @types/react-dom, name (+2 more)

### Community 62 - "Database Tooling Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, @boardly/config, drizzle-kit, @types/bun, @types/nodemailer, typescript, @boardly/config, drizzle-kit (+2 more)

### Community 63 - "Search and Saved Filters"
Cohesion: 0.49
Nodes (7): savedSearches, searchRoutes, createSavedSearch(), deleteSavedSearch(), httpError(), listSavedSearches(), performSearch()

### Community 64 - "SSO Integration Service"
Cohesion: 0.62
Nodes (7): ssoRoutes, generateSSOLoginUrl(), getSSOConfig(), httpError(), processSCIMWebhook(), processSSOCallback(), updateSSOConfig()

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

### Community 69 - "React Client Types"
Cohesion: 0.25
Nodes (9): react-dom, types, react, vite/client, react-dom, types, react, react-dom (+1 more)

### Community 70 - "Global TypeScript Options"
Cohesion: 0.22
Nodes (9): compilerOptions, jsx, lib, module, moduleResolution, skipLibCheck, strict, DOM (+1 more)

### Community 71 - "List Management Service"
Cohesion: 0.54
Nodes (6): listRoutes, createList(), deleteList(), listLists(), updateList(), verifyBoardAccess()

### Community 72 - "React Core Types"
Cohesion: 0.25
Nodes (8): @types/react, devDependencies, @babel/core, @types/react, typescript, @types/react, @types/react, @babel/core

### Community 73 - "Test Fixtures Package"
Cohesion: 0.25
Nodes (7): exports, ./factories, ./seeds, main, name, private, version

### Community 74 - "Shared Type Dependencies"
Cohesion: 0.29
Nodes (7): @boardly/shared-types, @boardly/shared-types, @boardly/shared-types, dependencies, @boardly/shared-types, zod, zod

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

### Community 79 - "TypeScript Dev Dependency"
Cohesion: 0.33
Nodes (6): typescript, devDependencies, typescript, devDependencies, typescript, typescript

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

### Community 84 - "Subscription Plan Enums"
Cohesion: 0.40
Nodes (5): PlanTier, Business, Enterprise, Free, Pro

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

### Community 89 - "Backend Package Config"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 91 - "Date Utility Library"
Cohesion: 0.50
Nodes (4): date-fns, date-fns, date-fns, date-fns

### Community 92 - "Icon Library"
Cohesion: 0.50
Nodes (4): lucide-react, lucide-react, lucide-react, lucide-react

### Community 93 - "State Management Library"
Cohesion: 0.50
Nodes (4): zustand, zustand, zustand, zustand

### Community 94 - "Notification Channel Enums"
Cohesion: 0.50
Nodes (4): NotificationChannel, Email, InApp, Push

### Community 95 - "Member Status Enums"
Cohesion: 0.50
Nodes (4): OrgMemberStatus, Active, Deactivated, Invited

### Community 96 - "Routing Library"
Cohesion: 0.67
Nodes (3): react-router-dom, react-router-dom, react-router-dom

### Community 97 - "Tailwind Vite Plugin"
Cohesion: 0.67
Nodes (3): @tailwindcss/vite, @tailwindcss/vite, @tailwindcss/vite

### Community 98 - "Animation CSS Library"
Cohesion: 0.67
Nodes (3): tw-animate-css, tw-animate-css, tw-animate-css

### Community 99 - "Button Component Path"
Cohesion: 0.67
Nodes (3): ../../packages/ui/src/components/button.tsx, @boardly/ui/button, @boardly/ui/button

### Community 100 - "UI Card Component"
Cohesion: 0.67
Nodes (3): ../../packages/ui/src/components/card.tsx, @boardly/ui/card, @boardly/ui/card

### Community 101 - "UI Dialog Component"
Cohesion: 0.67
Nodes (3): ../../packages/ui/src/components/confirm-dialog.tsx, @boardly/ui/confirm-dialog, @boardly/ui/confirm-dialog

### Community 102 - "UI Dropdown Component"
Cohesion: 0.67
Nodes (3): ../../packages/ui/src/components/dropdown-menu.tsx, @boardly/ui/dropdown-menu, @boardly/ui/dropdown-menu

### Community 103 - "UI Select Component"
Cohesion: 0.67
Nodes (3): ../../packages/ui/src/components/searchable-select.tsx, @boardly/ui/searchable-select, @boardly/ui/searchable-select

### Community 104 - "UI Sidebar Component"
Cohesion: 0.67
Nodes (3): ../../packages/ui/src/components/sidebar.tsx, @boardly/ui/sidebar, @boardly/ui/sidebar

### Community 105 - "UI Component Library"
Cohesion: 0.67
Nodes (3): ../../packages/ui/src/index.ts, @boardly/ui, @boardly/ui

### Community 107 - "System Core Definitions"
Cohesion: 0.67
Nodes (3): AI Agent Instructions, Drizzle ORM Schema, Permission Key Registry

### Community 108 - "Task Management Features"
Cohesion: 0.67
Nodes (3): EnterpriseDataGrid.tsx, MyTasks.tsx, trash/service.ts

### Community 111 - "Development Cache Management"
Cohesion: 0.67
Nodes (3): cache, persistent, dev

## Knowledge Gaps
- **679 isolated node(s):** `AppSidebarProps`, `ThemeToggleProps`, `UserProfileDropdownProps`, `AdminSidebarProps`, `NavItem` (+674 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 749 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `typescript` connect `TypeScript Dev Dependency` to `Linting and Formatting Config`, `Oxlint Linter Config`, `Vite Development Tooling`, `React Core Types`, `UI Type Definitions`, `Database Tooling Dependencies`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Database Tooling Dependencies` to `Backend Package Config`, `Vite Development Tooling`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `AppSidebarProps`, `ThemeToggleProps`, `UserProfileDropdownProps` to the rest of the system?**
  _679 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Layout Components` be split into smaller, more focused modules?**
  _Cohesion score 0.08251748251748252 - nodes in this community are weakly interconnected._
- **Should `Input Validation Schemas` be split into smaller, more focused modules?**
  _Cohesion score 0.03125 - nodes in this community are weakly interconnected._
- **Should `Database Schema Definitions` be split into smaller, more focused modules?**
  _Cohesion score 0.0597567424643046 - nodes in this community are weakly interconnected._
- **Should `Email Service Provider` be split into smaller, more focused modules?**
  _Cohesion score 0.07401129943502825 - nodes in this community are weakly interconnected._