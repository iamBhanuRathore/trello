# PERMISSIONS_MATRIX.md — Boardly Permission Key Registry

The exhaustive list of every permission key in the system. These are the string literals used in:

- `requirePermission('key.name')` guard in backend routes (see `packages/shared-types/src/permissions.ts`)
- The dashboard via `GET /roles/permissions` (there is no `usePermission` hook — UI reads the permission payload from that endpoint)
- The `permissions` table seed data
- `role_permissions` seed data linking roles to permissions

**Rule:** Never invent a permission key inline in a route or component. If the permission you need doesn't exist here, add it to this file first, then add it to the seed data, then use it in code. This keeps the permission namespace consistent and auditable.

---

## Naming Convention

```
<resource>.<action>
```

- `resource` = the entity being acted on (lowercase, singular)
- `action` = what the actor is doing (`create`, `read`, `update`, `delete`, `manage`, `invite`, `export`, `impersonate`, etc.)

Use `manage` when a permission bundles multiple actions (e.g. `billing.manage` = view + update + cancel).

---

## Permission Keys

### Platform-level (Super Admin only)

| Permission Key            | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `platform.manage`         | Full Super Admin access — all orgs, all users, all config |
| `org.impersonate`         | Log into any org as their admin (for support)             |
| `org.create`              | Create a new organization on the platform                 |
| `org.delete`              | Delete any organization (data + billing)                  |
| `feature_flag.manage`     | Enable/disable feature flags per org                      |
| `plan.manage`             | Create/modify billing plans                               |
| `platform.audit_log.read` | Read the global audit log across all orgs                 |
| `platform.health.read`    | View platform-wide system health dashboards               |
| `rate_limit.manage`       | Set or override per-org rate limits                       |

---

### Organization-level

| Permission Key           | Who typically holds it     | Description                                        |
| ------------------------ | -------------------------- | -------------------------------------------------- |
| `org.read`               | All org members            | Read basic org info (name, logo, members list)     |
| `org.update`             | Org Owner, Org Admin       | Update org name, slug, branding                    |
| `org.delete`             | Org Owner only             | Delete the organization                            |
| `org.transfer_ownership` | Org Owner only             | Transfer Org Owner role to another user            |
| `member.invite`          | Org Admin+                 | Invite new users to the organization               |
| `member.remove`          | Org Admin+                 | Remove a user from the organization                |
| `member.role.update`     | Org Admin+                 | Change another member's role                       |
| `member.deactivate`      | Org Admin+                 | Deactivate (not delete) a user account             |
| `billing.read`           | Org Owner, Billing Manager | View invoices and current plan                     |
| `billing.manage`         | Org Owner, Billing Manager | Upgrade/downgrade plan, manage seats               |
| `sso.configure`          | Org Owner, Org Admin       | Configure SAML/OIDC/SCIM settings                  |
| `security_policy.manage` | Org Owner, Org Admin       | Set 2FA enforcement, IP allowlist, session timeout |
| `branding.manage`        | Org Admin+                 | Upload logo, set colors, configure custom domain   |
| `integration.manage`     | Org Admin+                 | Configure Slack, GitHub, Zapier integrations       |
| `webhook.manage`         | Org Admin+                 | Create/delete/update org-level webhooks            |
| `audit_log.read`         | Org Admin+                 | Read this org's audit log                          |
| `audit_log.export`       | Org Admin+                 | Export audit log to CSV                            |
| `data.export`            | Org Owner                  | Export all org data (GDPR)                         |
| `custom_role.manage`     | Org Admin+                 | Create/edit/delete custom roles                    |
| `stage_template.manage`  | Org Admin+                 | Create/edit stage templates (Stage Manager)        |

---

### Workspace-level

| Permission Key                 | Who typically holds it | Description                           |
| ------------------------------ | ---------------------- | ------------------------------------- |
| `workspace.create`             | Org Admin+             | Create a new workspace inside the org |
| `workspace.read`               | Workspace members      | View workspace and its projects       |
| `workspace.update`             | Workspace Admin+       | Rename workspace, change visibility   |
| `workspace.delete`             | Org Admin+             | Delete a workspace                    |
| `workspace.member.invite`      | Workspace Admin+       | Add a user to this workspace          |
| `workspace.member.remove`      | Workspace Admin+       | Remove a user from this workspace     |
| `workspace.member.role.update` | Workspace Admin+       | Change a member's workspace role      |

---

### Project-level

| Permission Key               | Who typically holds it           | Description                             |
| ---------------------------- | -------------------------------- | --------------------------------------- |
| `project.create`             | Workspace Admin+, Org Admin+     | Create a new project inside a workspace |
| `project.read`               | Project members                  | View project and its boards             |
| `project.update`             | Project Admin+, Workspace Admin+ | Update project name, description, dates |
| `project.delete`             | Project Owner, Workspace Admin+  | Delete a project                        |
| `project.archive`            | Project Admin+, Workspace Admin+ | Archive a project                       |
| `project.member.invite`      | Project Admin+, Workspace Admin+ | Add a user to this project              |
| `project.member.remove`      | Project Admin+, Workspace Admin+ | Remove a user from this project         |
| `project.member.role.update` | Project Admin+                   | Change a member's project role          |
| `sprint.create`              | Project Admin+, Member           | Create a sprint inside a project        |
| `sprint.update`              | Project Admin+, Member           | Update sprint dates/goal/status         |
| `sprint.delete`              | Project Admin+                   | Delete a sprint                         |
| `phase.create`               | Project Admin+, Workspace Admin+ | Create a lifecycle phase                |
| `phase.update`               | Project Admin+, Workspace Admin+ | Update phase status, dates              |
| `phase.delete`               | Project Admin+, Workspace Admin+ | Delete a phase                          |
| `phase.sign_off`             | Project Admin+, Workspace Admin+ | Approve phase gate (enterprise)         |
| `project.report.read`        | Project members                  | View burndown, velocity, dashboards     |
| `project.export`             | Project Admin+                   | Export project data                     |
| `automation.manage`          | Project Admin+                   | Create/edit/delete project automations  |

---

### Board-level

| Permission Key             | Who typically holds it      | Description                     |
| -------------------------- | --------------------------- | ------------------------------- |
| `board.create`             | Project Admin+, Member      | Create a board inside a project |
| `board.read`               | Board members               | View the board                  |
| `board.update`             | Board Admin, Project Admin+ | Rename board, change background |
| `board.delete`             | Board Admin, Project Admin+ | Delete a board                  |
| `board.archive`            | Board Admin, Project Admin+ | Archive a board                 |
| `board.member.invite`      | Board Admin, Project Admin+ | Add a user to this board        |
| `board.member.remove`      | Board Admin, Project Admin+ | Remove a user from this board   |
| `board.member.role.update` | Board Admin, Project Admin+ | Change a member's board role    |
| `board.template.save`      | Board Admin                 | Save this board as a template   |
| `label.create`             | Board Admin, Member         | Create a label on this board    |
| `label.update`             | Board Admin, Member         | Edit a label                    |
| `label.delete`             | Board Admin                 | Delete a label                  |

---

### List-level

| Permission Key | Who typically holds it | Description                  |
| -------------- | ---------------------- | ---------------------------- |
| `list.create`  | Board Admin, Member    | Create a new list on a board |
| `list.update`  | Board Admin, Member    | Rename or reorder a list     |
| `list.delete`  | Board Admin            | Delete a list                |
| `list.archive` | Board Admin, Member    | Archive a list               |

---

### Card-level

| Permission Key             | Who typically holds it       | Description                                   |
| -------------------------- | ---------------------------- | --------------------------------------------- |
| `card.create`              | Board Member+                | Create a card in a list                       |
| `card.read`                | Board Viewer+                | View a card and its details                   |
| `card.update`              | Board Member+                | Edit card title, description, due date, cover |
| `card.delete`              | Board Admin, Card Assignee   | Delete a card                                 |
| `card.archive`             | Board Member+                | Archive a card                                |
| `card.move`                | Board Member+                | Move a card between lists or boards           |
| `card.assign`              | Board Member+                | Assign/unassign a user to a card              |
| `card.watch`               | Board Viewer+                | Watch/unwatch a card for notifications        |
| `card.label.add`           | Board Member+                | Add a label to a card                         |
| `card.label.remove`        | Board Member+                | Remove a label from a card                    |
| `card.due_date.set`        | Board Member+                | Set or clear the due date                     |
| `card.stage.update`        | Board Member+                | Change the card's stage                       |
| `card.sprint.assign`       | Board Member+                | Add/remove card from a sprint                 |
| `card.subtask.create`      | Board Member+                | Create a subtask under a card                 |
| `card.checklist.create`    | Board Member+                | Add a checklist to a card                     |
| `card.checklist.update`    | Board Member+                | Edit/reorder checklist items                  |
| `card.checklist.delete`    | Board Admin, Card Assignee   | Delete a checklist                            |
| `card.attachment.add`      | Board Member+                | Upload an attachment                          |
| `card.attachment.delete`   | Board Admin, Uploader        | Delete an attachment                          |
| `card.comment.create`      | Board Commenter+             | Post a comment                                |
| `card.comment.update`      | Comment Author, Board Admin  | Edit a comment                                |
| `card.comment.delete`      | Comment Author, Board Admin  | Delete a comment                              |
| `card.time_log.create`     | Board Member+                | Log time on a card                            |
| `card.time_log.update`     | Time Log Author, Board Admin | Edit a time log entry                         |
| `card.time_log.delete`     | Time Log Author, Board Admin | Delete a time log entry                       |
| `card.custom_field.update` | Board Member+                | Set/update custom field values                |

---

### Chat-level

| Permission Key          | Who typically holds it | Description                          |
| ----------------------- | ---------------------- | ------------------------------------ |
| `chat.group.create`     | Board Member+          | Create a group chat                  |
| `chat.channel.manage`   | Org Admin+             | Create/manage chat channels          |
| `chat.message.moderate` | Org Admin+             | Moderate (edit/delete) chat messages |

> **Note:** `org.delete` appears in both Platform and Organization scopes — one literal, two scopes (see the note on `ALL_PERMISSION_KEYS` in `packages/shared-types/src/permissions.ts`). Member-role labels like "Billing Manager" / "Workspace Admin" are organization-member roles (`OrgMemberRole` in `packages/shared-types/src/enums`); the four seeded system roles are Org Owner, Org Admin, Member, Viewer.

---

## Default Role → Permission Mapping

This is the seed data blueprint. Custom roles (created by Org Admins) can grant any subset of these.

| Permission Group      | Super Admin | Org Owner | Org Admin | Workspace Admin | Project Admin | Board Admin | Board Member | Board Commenter | Board Viewer |
| --------------------- | :---------: | :-------: | :-------: | :-------------: | :-----------: | :---------: | :----------: | :-------------: | :----------: |
| `platform.*`          |     ✅      |    ❌     |    ❌     |       ❌        |      ❌       |     ❌      |      ❌      |       ❌        |      ❌      |
| `org.read`            |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ✅      |      ✅      |       ✅        |      ✅      |
| `org.update`          |     ✅      |    ✅     |    ✅     |       ❌        |      ❌       |     ❌      |      ❌      |       ❌        |      ❌      |
| `org.delete`          |     ✅      |    ✅     |    ❌     |       ❌        |      ❌       |     ❌      |      ❌      |       ❌        |      ❌      |
| `member.invite`       |     ✅      |    ✅     |    ✅     |       ❌        |      ❌       |     ❌      |      ❌      |       ❌        |      ❌      |
| `billing.*`           |     ✅      |    ✅     |    ❌     |       ❌        |      ❌       |     ❌      |      ❌      |       ❌        |      ❌      |
| `workspace.create`    |     ✅      |    ✅     |    ✅     |       ❌        |      ❌       |     ❌      |      ❌      |       ❌        |      ❌      |
| `project.create`      |     ✅      |    ✅     |    ✅     |       ✅        |      ❌       |     ❌      |      ❌      |       ❌        |      ❌      |
| `board.create`        |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ❌      |      ❌      |       ❌        |      ❌      |
| `card.create`         |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ✅      |      ✅      |       ❌        |      ❌      |
| `card.read`           |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ✅      |      ✅      |       ✅        |      ✅      |
| `card.update`         |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ✅      |      ✅      |       ❌        |      ❌      |
| `card.delete`         |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ✅      |      ❌      |       ❌        |      ❌      |
| `card.comment.create` |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ✅      |      ✅      |       ✅        |      ❌      |
| `card.watch`          |     ✅      |    ✅     |    ✅     |       ✅        |      ✅       |     ✅      |      ✅      |       ✅        |      ✅      |

> **Note:** This table is a simplified summary. The actual seed data (`ALL_PERMISSION_KEYS` + system-role grants in `apps/backend/src/db/seed.ts`, permission constants in `packages/shared-types/src/permissions.ts`) is the source of truth once coded. Update both when adding new permissions.

---

## How to Add a New Permission

1. Add it to this file under the appropriate resource group.
2. Add it to `ALL_PERMISSION_KEYS` in `packages/shared-types/src/permissions.ts` (seeded via `apps/backend/src/db/seed.ts`).
3. Update the `role_permissions` seed data to assign it to the correct default roles.
4. Use `requirePermission('new.key')` in the backend route; the dashboard reads permissions via `GET /roles/permissions`.
5. Add a test asserting that the appropriate roles can/cannot perform the action.
6. Update `docs/Decisions.md` if the permission boundary is non-obvious.
