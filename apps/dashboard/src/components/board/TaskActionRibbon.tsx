import React from 'react';
import {
  FileText,
  Paperclip,
  CheckSquare,
  FolderGit2,
  Users,
  Eye,
  Workflow,
  Tag,
  Bell,
  Briefcase,
  GitCommit,
  Layers,
  Link2,
  Repeat,
  BarChart2,
  Calendar,
  Clock,
  LayoutGrid,
} from 'lucide-react';

export interface ActionRibbonItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  isActive?: boolean;
}

interface TaskActionRibbonProps {
  activeSection?: string;
  onSelectSection: (id: string) => void;
  counts?: {
    files?: number;
    checklists?: number;
    participants?: number;
    observers?: number;
    subtasks?: number;
    tags?: number;
    timeLogs?: number;
  };
}

export function TaskActionRibbon({
  activeSection,
  onSelectSection,
  counts,
}: TaskActionRibbonProps) {
  const ribbonItems: ActionRibbonItem[] = [
    {
      id: 'status-summary',
      label: 'Task status summaries',
      icon: <FileText className="w-3.5 h-3.5 text-muted-foreground" />,
    },
    {
      id: 'files',
      label: 'Files',
      icon: <Paperclip className="w-3.5 h-3.5 text-sky-500" />,
      count: counts?.files,
    },
    {
      id: 'checklists',
      label: 'Checklists',
      icon: <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />,
      count: counts?.checklists,
    },
    {
      id: 'project',
      label: 'Project',
      icon: <FolderGit2 className="w-3.5 h-3.5 text-indigo-500" />,
    },
    {
      id: 'participants',
      label: 'Participants',
      icon: <Users className="w-3.5 h-3.5 text-blue-500" />,
      count: counts?.participants,
    },
    {
      id: 'observers',
      label: 'Observers',
      icon: <Eye className="w-3.5 h-3.5 text-teal-500" />,
      count: counts?.observers,
    },
    {
      id: 'flow',
      label: 'Flow',
      icon: <Workflow className="w-3.5 h-3.5 text-amber-500" />,
    },
    {
      id: 'tags',
      label: 'Tags',
      icon: <Tag className="w-3.5 h-3.5 text-violet-500" />,
      count: counts?.tags,
    },
    {
      id: 'reminders',
      label: 'Reminders',
      icon: <Bell className="w-3.5 h-3.5 text-rose-500" />,
    },
    {
      id: 'crm',
      label: 'CRM items',
      icon: <Briefcase className="w-3.5 h-3.5 text-stone-500" />,
    },
    {
      id: 'parent-task',
      label: 'Parent task',
      icon: <GitCommit className="w-3.5 h-3.5 text-cyan-500" />,
    },
    {
      id: 'subtasks',
      label: 'Subtasks',
      icon: <Layers className="w-3.5 h-3.5 text-blue-600" />,
      count: counts?.subtasks,
    },
    {
      id: 'related-tasks',
      label: 'Related tasks',
      icon: <Link2 className="w-3.5 h-3.5 text-orange-500" />,
    },
    {
      id: 'recurring',
      label: 'Recurring task',
      icon: <Repeat className="w-3.5 h-3.5 text-purple-500" />,
    },
    {
      id: 'gantt',
      label: 'Gantt',
      icon: <BarChart2 className="w-3.5 h-3.5 text-emerald-600" />,
    },
    {
      id: 'time-planning',
      label: 'Time planning',
      icon: <Calendar className="w-3.5 h-3.5 text-sky-600" />,
    },
    {
      id: 'time-tracking',
      label: 'Time tracking',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
      count: counts?.timeLogs,
    },
    {
      id: 'custom-fields',
      label: 'Custom fields',
      icon: <LayoutGrid className="w-3.5 h-3.5 text-indigo-600" />,
    },
  ];

  return (
    <div className="w-full border-t border-border/70 pt-3 pb-1">
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        {ribbonItems.map((item) => {
          const isSelected = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer select-none ${
                isSelected
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-2xs font-semibold'
                  : 'bg-card/70 hover:bg-muted/60 border-border/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-muted text-[10px] font-semibold text-foreground/80">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
