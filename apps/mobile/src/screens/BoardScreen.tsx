import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { getBoardLists, getListCards, createCard } from '../lib/api';
import { offlineQueue } from '../lib/offlineQueue';
import { useMobileAuthStore } from '../store/authStore';

export function BoardScreen({
  boardId,
  boardTitle,
  onBack,
  onOpenCard,
}: {
  boardId: string;
  boardTitle: string;
  onBack: () => void;
  onOpenCard: (cardId: string, cardTitle: string) => void;
}) {
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeListForNewCard, setActiveListForNewCard] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  const isOfflineMode = useMobileAuthStore((s) => s.isOfflineMode);

  const loadBoardData = async () => {
    try {
      const listsData = await getBoardLists(boardId);
      const listsWithCards = await Promise.all(
        listsData.map(async (l: any) => {
          try {
            const cards = await getListCards(l.id);
            return { ...l, cards };
          } catch {
            return { ...l, cards: [] };
          }
        })
      );
      setLists(listsWithCards);
    } catch (err) {
      console.warn('Failed to load board lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoardData();
  }, [boardId]);

  const handleCreateCard = async () => {
    if (!newCardTitle.trim() || !activeListForNewCard) return;

    const title = newCardTitle.trim();
    const listId = activeListForNewCard;

    // Optimistic UI update
    const tempCard = {
      id: `temp_${Date.now()}`,
      title,
      listId,
      priority: 'medium',
      createdAt: new Date().toISOString(),
    };

    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, cards: [...l.cards, tempCard] } : l))
    );

    setActiveListForNewCard(null);
    setNewCardTitle('');

    try {
      if (isOfflineMode) {
        offlineQueue.enqueue('CREATE_CARD', { listId, title });
      } else {
        await createCard({ listId, title });
        loadBoardData();
      }
    } catch {
      // Fallback to offline queue
      offlineQueue.enqueue('CREATE_CARD', { listId, title });
      Alert.alert('Saved to Offline Queue', 'Card will be synchronized when connection recovers.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.boardTitle} numberOfLines={1}>
          {boardTitle}
        </Text>
      </View>

      {/* Horizontal Kanban Columns */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={styles.loadingText}>Loading board cards...</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.columnsContainer}
        >
          {lists.map((list) => (
            <View key={list.id} style={styles.columnCard}>
              <View style={styles.columnHeader}>
                <Text style={styles.columnTitle}>{list.title || list.name}</Text>
                <Text style={styles.columnCount}>{list.cards?.length || 0}</Text>
              </View>

              <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
                {list.cards?.map((card: any) => (
                  <TouchableOpacity
                    key={card.id}
                    style={styles.cardItem}
                    onPress={() => onOpenCard(card.id, card.title)}
                  >
                    <Text style={styles.cardItemTitle}>{card.title}</Text>

                    <View style={styles.cardFooter}>
                      <View
                        style={[
                          styles.priorityBadge,
                          card.priority === 'urgent' && styles.priorityUrgent,
                          card.priority === 'high' && styles.priorityHigh,
                        ]}
                      >
                        <Text style={styles.priorityText}>{card.priority || 'normal'}</Text>
                      </View>

                      {card.dueDate ? (
                        <Text style={styles.dueDateText}>
                          📅 {new Date(card.dueDate).toLocaleDateString()}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={styles.addCardBtn}
                  onPress={() => setActiveListForNewCard(list.id)}
                >
                  <Text style={styles.addCardText}>+ Add Card</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}

      {/* New Card Modal */}
      <Modal
        visible={!!activeListForNewCard}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveListForNewCard(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Card</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="What needs to be done?"
              placeholderTextColor="#71717a"
              value={newCardTitle}
              onChangeText={setNewCardTitle}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setActiveListForNewCard(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCreateBtn} onPress={handleCreateCard}>
                <Text style={styles.modalCreateText}>Create Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  boardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fafafa',
    flex: 1,
  },
  columnsContainer: {
    padding: 16,
    gap: 16,
  },
  columnCard: {
    width: 290,
    backgroundColor: '#18181b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 14,
    maxHeight: '94%',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fafafa',
  },
  columnCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
    backgroundColor: '#27272a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cardScroll: {
    flex: 1,
  },
  cardItem: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  cardItemTitle: {
    fontSize: 13,
    color: '#fafafa',
    fontWeight: '500',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#3f3f46',
  },
  priorityHigh: {
    backgroundColor: '#854d0e',
  },
  priorityUrgent: {
    backgroundColor: '#9f1239',
  },
  priorityText: {
    fontSize: 10,
    color: '#f4f4f5',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  dueDateText: {
    fontSize: 11,
    color: '#a1a1aa',
  },
  addCardBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addCardText: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#a1a1aa',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#18181b',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fafafa',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fafafa',
    fontSize: 14,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalCancelText: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  modalCreateBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalCreateText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
