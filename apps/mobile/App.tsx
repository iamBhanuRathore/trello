import { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMobileAuthStore } from './src/store/authStore';
import { LoginScreen } from './src/screens/LoginScreen';
import { WorkspacesScreen } from './src/screens/WorkspacesScreen';
import { BoardScreen } from './src/screens/BoardScreen';
import { CardDetailScreen } from './src/screens/CardDetailScreen';
import { OfflineQueueScreen } from './src/screens/OfflineQueueScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    },
  },
});

export default function App() {
  const isAuthenticated = useMobileAuthStore((s) => s.isAuthenticated);

  const [currentScreen, setCurrentScreen] = useState<
    'workspaces' | 'board' | 'card' | 'offline_queue'
  >('workspaces');

  const [activeBoard, setActiveBoard] = useState<{ id: string; title: string } | null>(null);
  const [activeCard, setActiveCard] = useState<{ id: string; title: string } | null>(null);

  const handleSelectBoard = (boardId: string, boardTitle: string) => {
    setActiveBoard({ id: boardId, title: boardTitle });
    setCurrentScreen('board');
  };

  const handleOpenCard = (cardId: string, cardTitle: string) => {
    setActiveCard({ id: cardId, title: cardTitle });
    setCurrentScreen('card');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#18181b" />

        {!isAuthenticated ? (
          <LoginScreen onLoginSuccess={() => setCurrentScreen('workspaces')} />
        ) : (
          <>
            {currentScreen === 'workspaces' && (
              <WorkspacesScreen
                onSelectBoard={handleSelectBoard}
                onOpenOfflineQueue={() => setCurrentScreen('offline_queue')}
              />
            )}

            {currentScreen === 'board' && activeBoard && (
              <BoardScreen
                boardId={activeBoard.id}
                boardTitle={activeBoard.title}
                onBack={() => setCurrentScreen('workspaces')}
                onOpenCard={handleOpenCard}
              />
            )}

            {currentScreen === 'card' && activeCard && (
              <CardDetailScreen
                cardId={activeCard.id}
                cardTitle={activeCard.title}
                onBack={() => setCurrentScreen('board')}
              />
            )}

            {currentScreen === 'offline_queue' && (
              <OfflineQueueScreen onBack={() => setCurrentScreen('workspaces')} />
            )}
          </>
        )}
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
});
