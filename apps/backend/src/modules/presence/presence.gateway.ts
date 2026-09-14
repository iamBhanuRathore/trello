import {
  recordUserHeartbeat,
  recordUserDisconnect,
  setUserPresenceOverride,
} from './presenceService';
import type { Database } from '../../db/index';

export interface PresenceSocketMessage {
  action: 'presence:heartbeat' | 'presence:status_override';
  status?: 'available' | 'busy' | 'away' | 'leave' | 'offline';
  customStatusText?: string;
  expiresInMinutes?: number;
}

export async function handlePresenceSocketAction(
  ws: any,
  message: PresenceSocketMessage,
  db: Database
) {
  const userId = ws.data.userId;
  if (!userId || !message.action) return;

  switch (message.action) {
    case 'presence:heartbeat': {
      await recordUserHeartbeat(userId);
      ws.send({ type: 'presence:heartbeat:ack', timestamp: Date.now() });
      break;
    }

    case 'presence:status_override': {
      if (message.status) {
        await setUserPresenceOverride(db, userId, {
          status: message.status,
          customStatusText: message.customStatusText,
          expiresInMinutes: message.expiresInMinutes,
        });
      }
      break;
    }

    default:
      break;
  }
}

export async function handlePresenceDisconnect(userId: string) {
  if (userId) {
    await recordUserDisconnect(userId);
  }
}
