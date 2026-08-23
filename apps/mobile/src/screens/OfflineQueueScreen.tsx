import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { offlineQueue, OfflineAction } from '../lib/offlineQueue';
import { createCard, moveCard, addCardComment, toggleChecklistItem, updateCard } from '../lib/api';

export function OfflineQueueScreen({ onBack }: { onBack: () => void }) {
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsub = offlineQueue.subscribe((updated) => {
      setQueue(updated);
    });
    return unsub;
  }, []);

  const handleSyncAll = async () => {
    if (queue.length === 0) {
      Alert.alert('No Actions', 'All actions are already synchronized.');
      return;
    }

    setIsSyncing(true);

    try {
      const result = await offlineQueue.replayQueue(async (action) => {
        switch (action.type) {
          case 'CREATE_CARD':
            return await createCard(action.payload);
          case 'MOVE_CARD':
            return await moveCard(action.payload.cardId, {
              listId: action.payload.listId,
              position: action.payload.position || 0,
            });
          case 'ADD_COMMENT':
            return await addCardComment(action.payload.cardId, action.payload.text);
          case 'TOGGLE_CHECKLIST':
            return await toggleChecklistItem(
              action.payload.cardId,
              action.payload.itemId,
              action.payload.isCompleted
            );
          case 'UPDATE_CARD':
            return await updateCard(action.payload.cardId, action.payload);
          default:
            throw new Error(`Unknown action type: ${action.type}`);
        }
      });

      Alert.alert(
        'Sync Completed',
        `Successfully synced ${result.succeeded} action(s). ${
          result.failed > 0 ? `${result.failed} action(s) failed.` : ''
        }`
      );
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Failed to sync queue.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Offline Action Queue</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Pending Mutations ({queue.length})</Text>
          <Text style={styles.summaryDesc}>
            Actions performed while offline are recorded here and automatically replayed when connection is restored.
          </Text>

          <TouchableOpacity
            style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
            onPress={handleSyncAll}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.syncBtnText}>⚡ Force Sync All Actions</Text>
            )}
          </TouchableOpacity>
        </View>

        {queue.length > 0 ? (
          <FlatList
            data={queue}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.actionCard}>
                <View style={styles.actionHeader}>
                  <Text style={styles.actionType}>{item.type}</Text>
                  <View
                    style={[
                      styles.statusPill,
                      item.status === 'failed' && styles.statusFailed,
                      item.status === 'syncing' && styles.statusSyncing,
                    ]}
                  >
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>

                <Text style={styles.actionPayload}>
                  {JSON.stringify(item.payload, null, 2)}
                </Text>

                <View style={styles.actionFooter}>
                  <Text style={styles.actionTime}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Text>
                  {item.errorMessage ? (
                    <Text style={styles.actionError}>{item.errorMessage}</Text>
                  ) : null}
                </View>
              </View>
            )}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>✓ All Caught Up</Text>
            <Text style={styles.emptySubtitle}>No pending offline actions.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backText: {
    color: '#818cf8',
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fafafa',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryBox: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fafafa',
    marginBottom: 6,
  },
  summaryDesc: {
    fontSize: 12,
    color: '#a1a1aa',
    lineHeight: 18,
    marginBottom: 14,
  },
  syncBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnDisabled: {
    backgroundColor: '#4338ca',
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  listContent: {
    gap: 10,
  },
  actionCard: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionType: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#818cf8',
    fontFamily: 'monospace',
  },
  statusPill: {
    backgroundColor: '#3f3f46',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusSyncing: {
    backgroundColor: '#1e3a8a',
  },
  statusFailed: {
    backgroundColor: '#881337',
  },
  statusText: {
    fontSize: 10,
    color: '#fafafa',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  actionPayload: {
    fontSize: 11,
    color: '#d4d4d8',
    fontFamily: 'monospace',
    backgroundColor: '#09090b',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionTime: {
    fontSize: 10,
    color: '#71717a',
  },
  actionError: {
    fontSize: 11,
    color: '#fb7185',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10b981',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#71717a',
  },
});
