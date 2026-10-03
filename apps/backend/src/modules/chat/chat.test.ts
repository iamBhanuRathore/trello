import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { deleteTestUser } from '../../test-utils';
import { purgeChatOrg } from './chat-test-teardown';
import { inviteMember } from '../organizations/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import {
  createDirectMessage,
  createGroupChannel,
  sendMessage,
  addChannelMember,
  linkChannelProject,
  unlinkChannelProject,
  getChannelDetails,
  listMessages,
  toggleReaction,
  postSystemMessage,
  notifyProjectChannels,
  createChatAttachment,
  pinMessage,
  listPinnedMessages,
  forwardMessage,
  getMessageSeenBy,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

// Every setupOrgWithProject call used to leak an org, an owner user, a
// workspace, a project and its channels. This file makes 21 of them per run, so
// a single run left 21 orgs behind in the shared boardly_test DB — measured
// against the database, not estimated. See chat-test-teardown.ts for the delete
// order, which is forced by the self-referential chat_messages FKs.
const createdOrgIds: string[] = [];
const createdEmails: string[] = [];

afterAll(async () => {
  for (const orgId of createdOrgIds) await purgeChatOrg(db, orgId);
  for (const email of createdEmails) await deleteTestUser(db, email);
  await client.end();
});

async function setupOrgWithProject(tag: string) {
  const id = `${Date.now()}_${Math.random().toString(36).substring(7)}_${tag}`;
  const { user, organization } = await signUp(db, {
    name: 'Chat Owner',
    email: `chat_owner_${id}@chat.com`,
    password: 'pass',
    orgName: `Chat Org ${id}`,
    orgSlug: `chat-org-${id}`,
  });
  createdOrgIds.push(organization.id);
  createdEmails.push(user.email);
  const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
  const proj = await createProject(db, {
    organizationId: organization.id,
    workspaceId: ws!.id,
    name: 'Proj',
  });
  return { user, organization, proj: proj! };
}

describe('Chat Service Validation & Rules', () => {
  const dummyDb: any = {};

  it('rejects direct messaging yourself', async () => {
    const selfId = 'user-uuid-1111';
    expect(createDirectMessage(dummyDb, 'org-1', selfId, selfId)).rejects.toThrow(
      'Cannot create direct message with yourself'
    );
  });

  it('rejects group creation without a name', async () => {
    expect(
      createGroupChannel(dummyDb, 'org-1', 'user-1', {
        name: '   ',
      })
    ).rejects.toThrow('Group channel name is required');
  });

  it('rejects sending empty message bodies even with replyToMessageId', async () => {
    expect(
      sendMessage(dummyDb, 'channel-1', 'org-1', 'user-1', {
        body: '    ',
        replyToMessageId: 'msg-123',
      })
    ).rejects.toThrow('Message body cannot be empty');
  });
});

describe('Channel ↔ Project Linking & Activity Feed', () => {
  it('links a project as channel owner and embeds it in details', async () => {
    const { user, organization, proj } = await setupOrgWithProject('link');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });

    const linked = await linkChannelProject(db, channel.id, user.id, organization.id, proj.id);
    expect(linked.projectId).toBe(proj.id);
    expect(linked.project?.name).toBe('Proj');

    const details = await getChannelDetails(db, channel.id, organization.id, user.id);
    expect(details.project?.id).toBe(proj.id);

    // Linking posts an activity message to the feed
    const feed = await listMessages(db, channel.id, organization.id, user.id);
    expect(feed.some((m) => m.isSystem && m.body.includes('Linked project'))).toBe(true);
  });

  it('serves a full message page in a fixed number of queries (no N+1)', async () => {
    // Guard the batched enrichment: a per-row variant cost ~150 round-trips for
    // a 50-message page. Counted through drizzle's query logger.
    let queries = 0;
    const countingClient = postgres(TEST_DB_URL, { max: 1 });
    const countingDb = drizzle(countingClient, {
      schema,
      logger: {
        logQuery: () => {
          queries++;
        },
      },
    }) as unknown as Database;

    const { user, organization } = await signUp(countingDb, {
      name: 'Perf',
      email: `chat_perf_${Date.now()}@chat.com`,
      password: 'pass',
      orgName: `Perf Org ${Date.now()}`,
      orgSlug: `perf-org-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    });
    const channel = await createGroupChannel(countingDb, organization.id, user.id, {
      name: 'perf',
    });
    for (let i = 0; i < 25; i++) {
      const m = await sendMessage(countingDb, channel.id, organization.id, user.id, {
        body: `msg ${i}`,
      });
      await toggleReaction(countingDb, m.id, organization.id, user.id, '🎉');
    }

    queries = 0;
    const page = await listMessages(
      countingDb,
      channel.id,
      organization.id,
      user.id,
      undefined,
      50
    );
    expect(page.length).toBeGreaterThan(0);
    expect(page[0]!.reactions.length).toBe(1);
    // membership + page + 4 batched enrichment queries. Slack-scale pages must
    // not scale with row count.
    expect(queries).toBeLessThanOrEqual(8);
    await countingClient.end();
  });

  it('rejects linking for non-admin members', async () => {
    const { user, organization, proj } = await setupOrgWithProject('link403');
    const bobEmail = `bob_403_${Date.now()}@chat.com`;
    createdEmails.push(bobEmail);
    const [bob] = await db
      .insert(schema.users)
      .values({ name: 'Bob', email: bobEmail, passwordHash: 'hash' })
      .returning();
    await inviteMember(db, organization.id, bobEmail, 'member', user.id);
    await db
      .update(schema.organizationMembers)
      .set({ status: 'active' })
      .where(eq(schema.organizationMembers.userId, bob!.id));

    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });
    await addChannelMember(db, channel.id, organization.id, user.id, bob!.id, 'member');
    expect(linkChannelProject(db, channel.id, bob!.id, organization.id, proj.id)).rejects.toThrow(
      'Channel Owner or Admin'
    );
  });

  it('rejects linking a project from another organization', async () => {
    const a = await setupOrgWithProject('linkA');
    const b = await setupOrgWithProject('linkB');
    const channel = await createGroupChannel(db, a.organization.id, a.user.id, { name: 'eng' });
    expect(
      linkChannelProject(db, channel.id, a.user.id, a.organization.id, b.proj.id)
    ).rejects.toThrow('Project not found');
  });

  it('rejects linking DM channels to a project', async () => {
    const { user, organization, proj } = await setupOrgWithProject('dmLink');
    const bobEmail = `bob_dm_${Date.now()}@chat.com`;
    createdEmails.push(bobEmail);
    const [bob] = await db
      .insert(schema.users)
      .values({ name: 'Bob', email: bobEmail, passwordHash: 'hash' })
      .returning();
    await inviteMember(db, organization.id, bobEmail, 'member', user.id);
    await db
      .update(schema.organizationMembers)
      .set({ status: 'active' })
      .where(eq(schema.organizationMembers.userId, bob!.id));

    const dm = await createDirectMessage(db, organization.id, user.id, bob!.id);
    expect(dm.type).toBe('direct');
    expect(linkChannelProject(db, dm.id, user.id, organization.id, proj.id)).rejects.toThrow(
      'cannot be linked'
    );
  });

  it('unlinks a project as channel owner', async () => {
    const { user, organization, proj } = await setupOrgWithProject('unlink');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });
    await linkChannelProject(db, channel.id, user.id, organization.id, proj.id);

    const unlinked = await unlinkChannelProject(db, channel.id, organization.id, user.id);
    expect(unlinked!.projectId).toBeNull();

    const details = await getChannelDetails(db, channel.id, organization.id, user.id);
    expect(details.project).toBeNull();
  });

  it('posts system messages visible in the feed', async () => {
    const { user, organization } = await setupOrgWithProject('sys');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });

    const msg = await postSystemMessage(db, channel.id, user.id, '🆕 **T-1** Hello created');
    expect(msg.isSystem).toBe(true);

    const feed = await listMessages(db, channel.id, organization.id, user.id);
    expect(feed.some((m) => m.id === msg.id && m.isSystem)).toBe(true);
  });

  it('fans project events out to linked channels only', async () => {
    const { user, organization, proj } = await setupOrgWithProject('fanout');
    const linked = await createGroupChannel(db, organization.id, user.id, { name: 'linked' });
    const plain = await createGroupChannel(db, organization.id, user.id, { name: 'plain' });
    await linkChannelProject(db, linked.id, user.id, organization.id, proj.id);

    await notifyProjectChannels(db, organization.id, proj.id, user.id, '🔀 **T-9** moved');

    const linkedFeed = await listMessages(db, linked.id, organization.id, user.id);
    const plainFeed = await listMessages(db, plain.id, organization.id, user.id);
    expect(linkedFeed.some((m) => m.body.includes('moved'))).toBe(true);
    // plain channel has no system traffic (only its own link/unlink have none either)
    expect(plainFeed.filter((m) => m.isSystem).length).toBe(0);
  });
});

describe('Chat File Attachments', () => {
  it('rejects empty file names', async () => {
    const { user, organization } = await setupOrgWithProject('attval');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });
    expect(
      createChatAttachment(db, channel.id, user.id, organization.id, { fileName: '   ' })
    ).rejects.toThrow('fileName is required');
  });

  it('rejects files over the 25 MB limit', async () => {
    const { user, organization } = await setupOrgWithProject('attsize');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });
    expect(
      createChatAttachment(db, channel.id, user.id, organization.id, {
        fileName: 'big.bin',
        fileSize: 26 * 1024 * 1024,
      })
    ).rejects.toThrow('25 MB');
  });

  it('rejects uploads from non-members', async () => {
    const a = await setupOrgWithProject('attmemA');
    const b = await setupOrgWithProject('attmemB');
    const channel = await createGroupChannel(db, a.organization.id, a.user.id, { name: 'eng' });
    expect(
      createChatAttachment(db, channel.id, b.user.id, a.organization.id, { fileName: 'x.png' })
    ).rejects.toThrow('not a member');
  });

  it('stages an attachment and links it on send', async () => {
    const { user, organization } = await setupOrgWithProject('attok');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });

    const { uploadUrl, attachment } = await createChatAttachment(
      db,
      channel.id,
      user.id,
      organization.id,
      {
        fileName: 'spec.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      }
    );
    expect(uploadUrl).toContain('http');
    expect(attachment.channelId).toBe(channel.id);
    expect(attachment.messageId).toBeNull();

    const sent = await sendMessage(db, channel.id, organization.id, user.id, {
      body: 'see attached',
      attachmentIds: [attachment.id],
    });
    const feed = await listMessages(db, channel.id, organization.id, user.id);
    const found = feed.find((m) => m.id === sent.id);
    expect(found?.attachments?.some((a: any) => a.id === attachment.id)).toBe(true);
  });
});

describe('Telegram Parity: Pin / Forward / Seen', () => {
  it('pins and unpins a group message, surfaced by listPinnedMessages', async () => {
    const { user, organization } = await setupOrgWithProject('pinok');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });
    const sent = await sendMessage(db, channel.id, organization.id, user.id, { body: 'pin me' });

    const pinned = await pinMessage(db, sent.id, organization.id, user.id, true);
    expect(pinned?.isPinned).toBe(true);

    const listed = await listPinnedMessages(db, channel.id, organization.id, user.id);
    expect(listed.some((m: any) => m.id === sent.id)).toBe(true);

    const unpinned = await pinMessage(db, sent.id, organization.id, user.id, false);
    expect(unpinned?.isPinned).toBe(false);
    const relisted = await listPinnedMessages(db, channel.id, organization.id, user.id);
    expect(relisted.some((m: any) => m.id === sent.id)).toBe(false);
  });

  it('rejects pinning thread replies and system messages', async () => {
    const { user, organization } = await setupOrgWithProject('pin400');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });
    const parent = await sendMessage(db, channel.id, organization.id, user.id, { body: 'parent' });
    const reply = await sendMessage(db, channel.id, organization.id, user.id, {
      body: 'reply',
      parentMessageId: parent.id,
    });
    expect(pinMessage(db, reply.id, organization.id, user.id, true)).rejects.toThrow(
      'Thread replies'
    );
    const sys = await postSystemMessage(db, channel.id, user.id, 'activity');
    expect(pinMessage(db, sys.id, organization.id, user.id, true)).rejects.toThrow(
      'System messages'
    );
  });

  it('forwards a message copy into another channel with provenance', async () => {
    const { user, organization } = await setupOrgWithProject('fwdok');
    const a = await createGroupChannel(db, organization.id, user.id, { name: 'a' });
    const b = await createGroupChannel(db, organization.id, user.id, { name: 'b' });
    const src = await sendMessage(db, a.id, organization.id, user.id, { body: 'forward me' });

    const copy = await forwardMessage(db, src.id, b.id, organization.id, user.id);
    expect(copy.channelId).toBe(b.id);
    expect(copy.body).toBe('forward me');
    expect(copy.forwardedFromId).toBe(src.id);

    const feed = await listMessages(db, b.id, organization.id, user.id);
    expect(feed.some((m) => m.id === copy.id)).toBe(true);
  });

  it('reports seen-by readers based on lastReadAt', async () => {
    const { user, organization } = await setupOrgWithProject('seenok');
    const channel = await createGroupChannel(db, organization.id, user.id, { name: 'eng' });
    const sent = await sendMessage(db, channel.id, organization.id, user.id, { body: 'seen?' });
    // Author-only channel: no other readers yet
    const seen = await getMessageSeenBy(db, sent.id, organization.id, user.id);
    expect(seen.messageId).toBe(sent.id);
    expect(seen.count).toBe(0);
    expect(seen.readers).toEqual([]);
  });

  it('rejects seen-by for non-members', async () => {
    const a = await setupOrgWithProject('seenA');
    const b = await setupOrgWithProject('seenB');
    const channel = await createGroupChannel(db, a.organization.id, a.user.id, { name: 'eng' });
    const sent = await sendMessage(db, channel.id, a.organization.id, a.user.id, { body: 'hi' });
    // Cross-org callers fail closed without an existence oracle
    expect(getMessageSeenBy(db, sent.id, b.organization.id, b.user.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('isolates channels by organization (cross-org IDOR guard)', async () => {
    const a = await setupOrgWithProject('xorgA');
    const b = await setupOrgWithProject('xorgB');
    const channel = await createGroupChannel(db, a.organization.id, a.user.id, { name: 'secret' });
    const sent = await sendMessage(db, channel.id, a.organization.id, a.user.id, {
      body: 'secret',
    });

    // Every channel/message read with the wrong org fails closed
    await expect(
      getChannelDetails(db, channel.id, b.organization.id, b.user.id)
    ).rejects.toMatchObject({ status: 404 });
    await expect(listMessages(db, channel.id, b.organization.id, b.user.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      sendMessage(db, channel.id, b.organization.id, b.user.id, { body: 'hijack' })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      toggleReaction(db, sent.id, b.organization.id, b.user.id, '👍')
    ).rejects.toMatchObject({ status: 404 });

    // Group creation silently drops cross-org invitees instead of leaking the channel
    const poisoned = await createGroupChannel(db, a.organization.id, a.user.id, {
      name: 'poison',
      memberUserIds: [b.user.id],
    });
    expect(poisoned.members.some((m: any) => m.userId === b.user.id)).toBe(false);
    await expect(
      getChannelDetails(db, poisoned.id, b.organization.id, b.user.id)
    ).rejects.toMatchObject({ status: 404 });
  });
});
