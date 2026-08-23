import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import {
  getCardDetail,
  getCardComments,
  addCardComment,
  toggleChecklistItem,
} from '../lib/api';
import { offlineQueue } from '../lib/offlineQueue';
import { useMobileAuthStore } from '../store/authStore';

export function CardDetailScreen({
  cardId,
  cardTitle,
  onBack,
}: {
  cardId: string;
  cardTitle: string;
  onBack: () => void;
}) {
  const [card, setCard] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);

  const { user, isOfflineMode } = useMobileAuthStore();

  const loadData = async () => {
    try {
      const [cardData, commentsData] = await Promise.all([
        getCardDetail(cardId),
        getCardComments(cardId),
      ]);
      setCard(cardData);
      setComments(commentsData);
    } catch (err) {
      console.warn('Failed to load card details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [cardId]);

  const handleToggleChecklist = async (itemId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;

    // Optimistic update
    setCard((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        checklists: prev.checklists?.map((ch: any) => ({
          ...ch,
          items: ch.items?.map((item: any) =>
            item.id === itemId ? { ...item, isCompleted: nextStatus } : item
          ),
        })),
      };
    });

    try {
      if (isOfflineMode) {
        offlineQueue.enqueue('TOGGLE_CHECKLIST', { cardId, itemId, isCompleted: nextStatus });
      } else {
        await toggleChecklistItem(cardId, itemId, nextStatus);
      }
    } catch {
      offlineQueue.enqueue('TOGGLE_CHECKLIST', { cardId, itemId, isCompleted: nextStatus });
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const text = newComment.trim();

    // Optimistic comment item
    const tempComment = {
      id: `temp_c_${Date.now()}`,
      content: text,
      createdAt: new Date().toISOString(),
      user: { name: user?.name || 'You', avatarUrl: user?.avatarUrl },
    };

    setComments((prev) => [tempComment, ...prev]);
    setNewComment('');
    setSubmittingComment(true);

    try {
      if (isOfflineMode) {
        offlineQueue.enqueue('ADD_COMMENT', { cardId, text });
      } else {
        await addCardComment(cardId, text);
        loadData();
      }
    } catch {
      offlineQueue.enqueue('ADD_COMMENT', { cardId, text });
      Alert.alert('Saved to Offline Queue', 'Comment will be posted when online.');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Card Details
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={styles.loadingText}>Loading card details...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollContent}>
          {/* Card Title & Meta */}
          <View style={styles.cardHeaderSection}>
            <Text style={styles.cardTitle}>{card?.title || cardTitle}</Text>

            <View style={styles.metaRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{card?.priority || 'Medium'}</Text>
              </View>

              {card?.dueDate ? (
                <Text style={styles.metaText}>
                  Due {new Date(card.dueDate).toLocaleDateString()}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>
              {card?.description || 'No description provided for this task.'}
            </Text>
          </View>

          {/* Checklists */}
          {card?.checklists?.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Checklists</Text>
              {card.checklists.map((ch: any) => (
                <View key={ch.id} style={styles.checklistCard}>
                  <Text style={styles.checklistTitle}>{ch.title}</Text>
                  {ch.items?.map((item: any) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.checklistItem}
                      onPress={() => handleToggleChecklist(item.id, item.isCompleted)}
                    >
                      <View style={[styles.checkbox, item.isCompleted && styles.checkboxChecked]}>
                        {item.isCompleted && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text
                        style={[
                          styles.checkItemText,
                          item.isCompleted && styles.checkItemTextCompleted,
                        ]}
                      >
                        {item.content}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          ) : null}

          {/* Comments & Activity Thread */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Discussion ({comments.length})</Text>

            {/* New Comment Input */}
            <View style={styles.commentInputBox}>
              <TextInput
                style={styles.commentInput}
                placeholder="Write a comment..."
                placeholderTextColor="#71717a"
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.sendCommentBtn,
                  (!newComment.trim() || submittingComment) && styles.sendCommentBtnDisabled,
                ]}
                onPress={handleAddComment}
                disabled={!newComment.trim() || submittingComment}
              >
                <Text style={styles.sendCommentText}>Post</Text>
              </TouchableOpacity>
            </View>

            {/* Comment List */}
            <View style={styles.commentList}>
              {comments.map((comment) => (
                <View key={comment.id} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>
                      {comment.user?.name || 'Teammate'}
                    </Text>
                    <Text style={styles.commentTime}>
                      {comment.createdAt ? new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                  <Text style={styles.commentBody}>{comment.content}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
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
  scrollContent: {
    padding: 16,
  },
  cardHeaderSection: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fafafa',
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    backgroundColor: '#3f3f46',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    color: '#fafafa',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  metaText: {
    fontSize: 12,
    color: '#a1a1aa',
  },
  section: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 13,
    color: '#d4d4d8',
    lineHeight: 20,
  },
  checklistCard: {
    marginTop: 8,
  },
  checklistTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#818cf8',
    marginBottom: 8,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#71717a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkItemText: {
    fontSize: 13,
    color: '#fafafa',
  },
  checkItemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#71717a',
  },
  commentInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fafafa',
    fontSize: 13,
    maxHeight: 80,
  },
  sendCommentBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendCommentBtnDisabled: {
    backgroundColor: '#3f3f46',
  },
  sendCommentText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  commentList: {
    gap: 10,
  },
  commentCard: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818cf8',
  },
  commentTime: {
    fontSize: 10,
    color: '#71717a',
  },
  commentBody: {
    fontSize: 13,
    color: '#fafafa',
    lineHeight: 18,
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
});
