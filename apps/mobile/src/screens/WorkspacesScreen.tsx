import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { getWorkspaces, getWorkspaceProjects, getProjectBoards } from '../lib/api';
import { useMobileAuthStore } from '../store/authStore';
import { offlineQueue } from '../lib/offlineQueue';

export function WorkspacesScreen({
  onSelectBoard,
  onOpenOfflineQueue,
}: {
  onSelectBoard: (boardId: string, boardTitle: string) => void;
  onOpenOfflineQueue: () => void;
}) {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCount, setPendingCount] = useState(offlineQueue.getPendingCount());

  const { user, logout } = useMobileAuthStore();

  useEffect(() => {
    const unsub = offlineQueue.subscribe(() => {
      setPendingCount(offlineQueue.getPendingCount());
    });
    return unsub;
  }, []);

  const loadData = async () => {
    try {
      const wsData = await getWorkspaces();
      const populated = await Promise.all(
        wsData.map(async (ws: any) => {
          try {
            const projects = await getWorkspaceProjects(ws.id);
            const projectsWithBoards = await Promise.all(
              projects.map(async (p: any) => {
                try {
                  const boards = await getProjectBoards(p.id);
                  return { ...p, boards };
                } catch {
                  return { ...p, boards: [] };
                }
              })
            );
            return { ...ws, projects: projectsWithBoards };
          } catch {
            return { ...ws, projects: [] };
          }
        })
      );
      setWorkspaces(populated);
    } catch (err) {
      console.warn('Failed to load workspaces:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || 'Teammate'}</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.badgeBtn, pendingCount > 0 && styles.activeBadgeBtn]}
            onPress={onOpenOfflineQueue}
          >
            <Text style={styles.badgeText}>
              {pendingCount > 0 ? `⚡ Sync (${pendingCount})` : '✓ Synced'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Workspace List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={styles.loadingText}>Loading workspaces...</Text>
        </View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item: ws }) => (
            <View style={styles.workspaceCard}>
              <Text style={styles.workspaceName}>{ws.name}</Text>

              {ws.projects?.length > 0 ? (
                ws.projects.map((proj: any) => (
                  <View key={proj.id} style={styles.projectSection}>
                    <Text style={styles.projectName}>📁 {proj.name}</Text>

                    <View style={styles.boardsContainer}>
                      {proj.boards?.length > 0 ? (
                        proj.boards.map((b: any) => (
                          <TouchableOpacity
                            key={b.id}
                            style={styles.boardChip}
                            onPress={() => onSelectBoard(b.id, b.title || b.name || 'Board')}
                          >
                            <Text style={styles.boardChipText}>📊 {b.title || b.name}</Text>
                          </TouchableOpacity>
                        ))
                      ) : (
                        <Text style={styles.emptyText}>No boards created yet.</Text>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No projects in this workspace.</Text>
              )}
            </View>
          )}
        />
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181b',
  },
  greeting: {
    fontSize: 12,
    color: '#a1a1aa',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fafafa',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  activeBadgeBtn: {
    backgroundColor: '#4338ca',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e4e4e7',
  },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logoutText: {
    fontSize: 12,
    color: '#f43f5e',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  workspaceCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#818cf8',
    marginBottom: 12,
  },
  projectSection: {
    marginTop: 8,
    paddingLeft: 4,
  },
  projectName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e4e4e7',
    marginBottom: 8,
  },
  boardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  boardChip: {
    backgroundColor: '#27272a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  boardChipText: {
    fontSize: 12,
    color: '#fafafa',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 12,
    color: '#71717a',
    fontStyle: 'italic',
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
