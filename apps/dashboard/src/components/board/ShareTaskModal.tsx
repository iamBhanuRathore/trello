import { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  GitBranch,
  FileCode,
  Tag,
  ExternalLink,
  Mail,
  MessageSquare,
  Sparkles,
  Layers,
  X,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import {
  getTaskIdentifier,
  getGitBranchName,
  getMarkdownLink,
  copyTextToClipboard,
} from '../../utils/taskIdentifier';
import { useDialogClose } from '../../hooks/useDialogClose';

interface ShareTaskModalProps {
  card: any;
  open: boolean;
  onClose: () => void;
}

export function ShareTaskModal({ card, open, onClose }: ShareTaskModalProps) {
  // Single close path (AGENTS.md §11). This is a hand-rolled portal, so the
  // backdrop gets handleOverlayClick (it previously had no click handler at all,
  // leaving touch users with no way to dismiss) and Esc goes through requestClose.
  const { requestClose, handleOverlayClick } = useDialogClose({ isOpen: open, onClose });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!open || !card) return null;

  const taskIdentifier = getTaskIdentifier(card);
  const shareUrl = `${window.location.origin}/cards/${card.id}`;
  const markdownLink = getMarkdownLink(taskIdentifier, card.title, shareUrl);
  const gitBranchName = getGitBranchName(taskIdentifier, card.title);
  const gitCommand = `git checkout -b ${gitBranchName}`;

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Pre-formatted messages for team platforms
  const shareSummary = `${taskIdentifier}: ${card.title} [Status: ${card.listName || 'Active'}]`;
  const teamsShareUrl = `https://teams.microsoft.com/share?href=${encodeURIComponent(
    shareUrl
  )}&msgText=${encodeURIComponent(shareSummary)}`;
  const emailSubject = `[Boardly Task] ${taskIdentifier}: ${card.title}`;
  const emailBody = `Hey team,\n\nCheck out this task on Boardly:\n\nTask: ${taskIdentifier} - ${card.title}\nStatus: ${card.listName || 'In Progress'}\nBoard: ${card.boardName || 'Project'}\nLink: ${shareUrl}\n\nDescription snippet:\n${card.description ? card.description.slice(0, 300) : 'No description.'}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `${shareSummary}\n${shareUrl}`
  )}`;

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50 duration-150"
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Share Task</h3>
              <p className="text-xs text-muted-foreground">
                Copy direct links, developer references, or share to team channels
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={requestClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Card Preview Tile (Simulates rich unfurl card in MS Teams / Slack) */}
          <div className="p-4 rounded-xl border border-border bg-muted/30 relative overflow-hidden group">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-mono font-bold border border-primary/25">
                  {taskIdentifier}
                </span>
                {card.listName && (
                  <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px] font-medium border border-border">
                    {card.listName}
                  </span>
                )}
                {card.boardName && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Layers className="w-3 h-3" /> {card.boardName}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Rich URL Preview
              </span>
            </div>
            <h4 className="text-sm font-semibold text-foreground line-clamp-1">{card.title}</h4>
            {card.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {card.description}
              </p>
            )}
          </div>

          {/* Share Actions Section */}
          <div className="space-y-3.5">
            {/* 1. Direct Web Link */}
            <div>
              <label className="text-xs font-semibold text-foreground flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-primary" /> Direct Task URL
                </span>
                {copiedKey === 'url' && (
                  <span className="text-[11px] text-emerald-500 font-medium animate-in fade-in">
                    Copied to clipboard!
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="text-xs font-mono bg-muted/40 h-9 select-all"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  className="h-9 px-3 shrink-0 gap-1.5 text-xs cursor-pointer font-medium"
                  onClick={() => handleCopy(shareUrl, 'url')}
                >
                  {copiedKey === 'url' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'url' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>

            {/* 2. Markdown Reference */}
            <div>
              <label className="text-xs font-semibold text-foreground flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-primary" /> Markdown Link
                </span>
                {copiedKey === 'markdown' && (
                  <span className="text-[11px] text-emerald-500 font-medium animate-in fade-in">
                    Copied!
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={markdownLink}
                  className="text-xs font-mono bg-muted/40 h-9 select-all"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 shrink-0 gap-1.5 text-xs cursor-pointer"
                  onClick={() => handleCopy(markdownLink, 'markdown')}
                >
                  {copiedKey === 'markdown' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'markdown' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>

            {/* 3. Git Branch Checkout */}
            <div>
              <label className="text-xs font-semibold text-foreground flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-primary" /> Git Branch Command
                </span>
                {copiedKey === 'git' && (
                  <span className="text-[11px] text-emerald-500 font-medium animate-in fade-in">
                    Copied!
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={gitCommand}
                  className="text-xs font-mono bg-muted/40 h-9 select-all"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 shrink-0 gap-1.5 text-xs cursor-pointer"
                  onClick={() => handleCopy(gitCommand, 'git')}
                >
                  {copiedKey === 'git' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'git' ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>

            {/* 4. Task Key Only */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border text-xs">
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Task Identifier:</span>
                <span className="font-mono font-bold text-foreground">{taskIdentifier}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1 text-primary cursor-pointer hover:bg-primary/10"
                onClick={() => handleCopy(taskIdentifier, 'key')}
              >
                {copiedKey === 'key' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === 'key' ? 'Copied ID' : 'Copy ID'}</span>
              </Button>
            </div>
          </div>

          {/* Social / Team Integration Buttons */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
              Share to Channels
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* MS Teams */}
              <a
                href={teamsShareUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all text-center gap-1.5 group cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-[#464EB8]/10 text-[#5B63D3] flex items-center justify-center group-hover:scale-110 transition-transform font-bold text-xs">
                  T
                </div>
                <span className="text-[11px] font-medium text-foreground">MS Teams</span>
              </a>

              {/* Slack Link */}
              <button
                type="button"
                onClick={() =>
                  handleCopy(`<${shareUrl}|${taskIdentifier}: ${card.title}>`, 'slack')
                }
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all text-center gap-1.5 group cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-[#E01E5A]/10 text-[#E01E5A] flex items-center justify-center group-hover:scale-110 transition-transform font-bold text-xs">
                  #
                </div>
                <span className="text-[11px] font-medium text-foreground">
                  {copiedKey === 'slack' ? 'Slack Copied!' : 'Slack Link'}
                </span>
              </button>

              {/* Email */}
              <a
                href={mailtoUrl}
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all text-center gap-1.5 group cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-medium text-foreground">Email</span>
              </a>

              {/* WhatsApp */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all text-center gap-1.5 group cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-medium text-foreground">WhatsApp</span>
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Boardly Enterprise Share</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-3 cursor-pointer"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
