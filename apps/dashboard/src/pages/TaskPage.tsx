import { useParams } from 'react-router-dom';
import { TaskDetailView } from '../components/board/TaskDetailView';

export function TaskPage() {
  const { cardId } = useParams<{ cardId: string }>();

  if (!cardId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No task specified.
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8 bg-background">
      <TaskDetailView cardId={cardId} mode="page" />
    </div>
  );
}
