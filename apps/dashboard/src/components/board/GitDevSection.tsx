import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GitBranch,
  GitPullRequest,
  GitCommitHorizontal,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { gitService } from '../../lib/gitService';

const STATE_STYLES: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
  updated: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  merged: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25',
  pushed: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
  changes_requested: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
  closed: 'bg-muted text-muted-foreground border-border',
  commented: 'bg-muted text-muted-foreground border-border',
};

export const GitDevSection: React.FC<{ cardId: string }> = ({ cardId }) => {
  const [copied, setCopied] = useState(false);

  const { data: links = [] } = useQuery({
    queryKey: ['git', 'card-links', cardId],
    queryFn: () => gitService.cardLinks(cardId),
    staleTime: 30000,
  });

  const { data: branchData } = useQuery({
    queryKey: ['git', 'branch-name', cardId],
    queryFn: () => gitService.branchName(cardId),
    staleTime: 300000,
  });

  const copyBranch = async () => {
    if (!branchData?.branch) return;
    try {
      await navigator.clipboard.writeText(branchData.branch);
      setCopied(true);
      toast.success('Branch name copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed — select the name manually');
    }
  };

  const prs = links.filter((l) => l.kind === 'pr');
  const commits = links.filter((l) => l.kind === 'commit');

  return (
    <div
      id="section-development"
      className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-bold text-foreground">Development</span>
          {links.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
              {links.length}
            </span>
          )}
        </div>
        {branchData?.branch && (
          <button
            type="button"
            onClick={copyBranch}
            title={`Create branch: ${branchData.branch}`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/60 border border-border/60 hover:border-primary/50 text-[11px] font-mono font-semibold transition-colors cursor-pointer max-w-[220px]"
          >
            <span className="truncate">{branchData.branch}</span>
            {copied ? (
              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
          </button>
        )}
      </div>

      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          No branches, commits, or PRs linked yet. Mention the ticket key (e.g.{' '}
          <span className="font-mono font-semibold text-foreground">BCW-12</span>) in a branch name,
          commit, or PR — or connect a repo in Integrations.
        </p>
      ) : (
        <div className="space-y-1.5">
          {prs.map((pr) => (
            <a
              key={pr.id}
              href={pr.url || undefined}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2.5 p-2 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-muted/40 transition-all group"
            >
              <GitPullRequest className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold truncate">
                  #{pr.ref} {pr.title || ''}
                </span>
                <span className="block text-[10px] text-muted-foreground truncate">
                  {pr.owner}/{pr.repo}
                  {pr.author ? ` · by ${pr.author}` : ''}
                </span>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold capitalize shrink-0 ${STATE_STYLES[pr.state] || STATE_STYLES.closed}`}
              >
                {pr.state.replace('_', ' ')}
              </span>
              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          ))}
          {commits.slice(0, 5).map((c) => (
            <a
              key={c.id}
              href={c.url || undefined}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2.5 p-2 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-muted/40 transition-all group"
            >
              <GitCommitHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-mono truncate">
                  {c.ref.slice(0, 7)} {c.title || ''}
                </span>
                {c.author && (
                  <span className="block text-[10px] text-muted-foreground">by {c.author}</span>
                )}
              </span>
              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          ))}
          {commits.length > 5 && (
            <p className="text-[10px] text-muted-foreground text-center">
              +{commits.length - 5} more commits
            </p>
          )}
        </div>
      )}
    </div>
  );
};
