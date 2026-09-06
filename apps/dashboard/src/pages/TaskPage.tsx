import { useParams } from 'react-router-dom';
import { TaskDetailView } from '../components/board/TaskDetailView';

export function TaskPage() {
  const { cardId } = useParams<{ cardId: string }>();

  if (!cardId) {
    return <div className="p-8 text-center text-muted-foreground">No task specified.</div>;
  }

  return (
    <div className="-m-4 md:-m-6 flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      <TaskDetailView cardId={cardId} mode="page" />
    </div>
  );
}
