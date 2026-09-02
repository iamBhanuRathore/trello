import { useParams } from 'react-router-dom';
import { TaskDetailView } from '../components/board/TaskDetailView';

export function TaskPage() {
  const { cardId } = useParams<{ cardId: string }>();

  if (!cardId) {
    return <div className="p-8 text-center text-muted-foreground">No task specified.</div>;
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] p-2 sm:p-4 lg:p-6 bg-muted/20 flex flex-col overflow-hidden">
      <TaskDetailView cardId={cardId} mode="page" />
    </div>
  );
}
