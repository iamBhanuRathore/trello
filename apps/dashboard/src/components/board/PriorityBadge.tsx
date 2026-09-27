import React from 'react';

interface PriorityBadgeProps {
  priority?: { name?: string | null; color?: string | null } | null;
  className?: string;
}

/** Org-configured priority pill — color always comes from the backend, never hardcoded. */
export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, className = '' }) => {
  if (!priority?.name) return null;
  const color = priority.color || '#64748b';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${className}`}
      style={{
        backgroundColor: `${color}1f`,
        color,
        borderColor: `${color}4d`,
      }}
      title={`Priority: ${priority.name}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {priority.name}
    </span>
  );
};
