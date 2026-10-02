import React from 'react';
import { format } from 'date-fns';
import { LayoutGrid } from 'lucide-react';

interface TaskCustomFieldsCardProps {
  createdAt?: string;
  estimateMinutes?: number | null;
}

export const TaskCustomFieldsCard: React.FC<TaskCustomFieldsCardProps> = ({
  createdAt,
  estimateMinutes,
}) => {
  return (
    <div
      id="section-custom-fields"
      className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
    >
      <div className="flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-bold text-foreground">Custom fields</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="w-24 text-muted-foreground font-medium shrink-0">Assigned Date:</span>
          <span className="font-semibold text-foreground">
            {createdAt ? format(new Date(createdAt), 'MMMM d, yyyy') : 'August 10, 2026'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-24 text-muted-foreground font-medium shrink-0">Estimated:</span>
          <span className="font-semibold text-foreground">
            {estimateMinutes ? `${(estimateMinutes / 60).toFixed(1)} hrs` : 'Not set'}
          </span>
        </div>
      </div>
    </div>
  );
};
