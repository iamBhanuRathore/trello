import type { Database } from '../../db/index';
import { deleteTestOrg } from '../../test-utils';

/**
 * Chat test teardown.
 *
 * chat.test.ts creates 21 organizations per run (measured against
 * boardly_test, not estimated) and until recently kept none of them, so the
 * shared test database grew by 21 orgs, 21 owner users, 21 workspaces, 21
 * projects and every channel/message/attachment/reaction in them on every run.
 *
 * The full chain (reactions → attachments → self-referential messages →
 * members → channels → workspaces → projects → org root) now lives in
 * `deleteTestOrg` in test-utils.ts, which every suite shares. This wrapper
 * stays so chat.test.ts keeps its named teardown; it delegates entirely.
 *
 * Lives beside the suite rather than inside it: chat.test.ts is already the
 * largest test file in the repo, and AGENTS.md §10 is explicit about not growing
 * one file to hold every concern.
 */
export async function purgeChatOrg(db: Database, orgId: string): Promise<void> {
  await deleteTestOrg(db, orgId);
}
