import { describe, it, expect } from 'bun:test';
import { createDirectMessage, createGroupChannel, sendMessage } from './service';

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
      sendMessage(dummyDb, 'channel-1', 'user-1', {
        body: '    ',
        replyToMessageId: 'msg-123',
      })
    ).rejects.toThrow('Message body cannot be empty');
  });
});
