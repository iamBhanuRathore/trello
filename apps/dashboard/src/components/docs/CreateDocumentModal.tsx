import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { BookOpen, FileText, Cpu, GitBranch, Users, Sparkles, Target } from 'lucide-react';

export interface CreateDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (doc: { title: string; content: string }) => void;
  isLoading?: boolean;
}

interface DocTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  getContent: (title: string) => string;
}

const TEMPLATES: DocTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Empty markdown canvas to start from scratch',
    icon: FileText,
    getContent: (title) => `# ${title}\n\nStart writing your document here...`,
  },
  {
    id: 'spec',
    name: 'Technical Specification',
    description: 'Architecture design, components, and implementation plan',
    icon: Cpu,
    getContent: (title) => `# ${title} — Technical Specification

## 1. Overview & Objectives
High-level summary of the problem and technical goals.

## 2. Architecture & System Design
- **Architecture Flow:**
- **Key Components:**
- **Data Models & Schemas:**

## 3. Implementation Details
Detailed step-by-step breakdown for engineering execution.

## 4. Security, Scale & Performance
- Edge cases and resilience
- Latency and throughput considerations

## 5. Rollout & Verification
- Testing strategy and acceptance criteria
- Deployment checkpoints`,
  },
  {
    id: 'rfc',
    name: 'RFC / Architecture Decision (ADR)',
    description: 'Decision records, trade-offs, and design rationale',
    icon: GitBranch,
    getContent: (title) => `# RFC: ${title}

**Status:** Proposed  
**Author:** (Author Name)  
**Date:** ${new Date().toISOString().split('T')[0]}

## Context & Problem Statement
What problem are we trying to solve? Why now?

## Considered Options
1. **Option A:** Description, Pros & Cons
2. **Option B:** Description, Pros & Cons

## Decision & Rationale
Which option is selected and why.

## Consequences & Trade-offs
Positive and negative impacts of this decision.`,
  },
  {
    id: 'prd',
    name: 'Product Requirement (PRD)',
    description: 'User personas, requirements, and success metrics',
    icon: Target,
    getContent: (title) => `# PRD: ${title}

## 1. Problem Statement
Why does this feature matter to our users?

## 2. Target Audience & Personas
Who will use this capability?

## 3. User Stories & Acceptance Criteria
- [ ] As a user, I want to ... so that ...
- [ ] As an admin, I want to ... so that ...

## 4. Success Metrics & KPIs
- Primary KPI:
- Secondary KPI:`,
  },
  {
    id: 'meeting',
    name: 'Meeting Notes & Agenda',
    description: 'Structured agenda, minutes, and action items',
    icon: Users,
    getContent: (title) => `# Meeting: ${title}

**Date:** ${new Date().toLocaleDateString()}  
**Attendees:**  
**Facilitator:**  

## Agenda
1. 
2. 

## Key Discussion Points
- 

## Action Items
- [ ] Assignee: Action item description (Due: YYYY-MM-DD)`,
  },
];

export const CreateDocumentModal: React.FC<CreateDocumentModalProps> = ({
  open,
  onOpenChange,
  onCreate,
  isLoading = false,
}) => {
  const [title, setTitle] = useState('New Specification');
  const [selectedTemplateId, setSelectedTemplateId] = useState('spec');

  useEffect(() => {
    if (open) {
      setTitle('New Specification');
      setSelectedTemplateId('spec');
    }
  }, [open]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const template = TEMPLATES.find((t) => t.id === selectedTemplateId) || TEMPLATES[0];
    const initialContent = template.getContent(cleanTitle);

    onCreate({
      title: cleanTitle,
      content: initialContent,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Header */}
          <DialogHeader className="p-6 border-b border-border/70 bg-card shrink-0 space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                  Create New Document
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Start a technical document, specification, or knowledge base article.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Title Input */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-title" className="text-xs font-semibold text-foreground">
                Document Title
              </Label>
              <Input
                id="doc-title"
                autoFocus
                placeholder="e.g. Real-Time Sync Architecture"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 text-sm focus-visible:ring-teal-500/50"
                disabled={isLoading}
              />
            </div>

            {/* Template Chooser */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Starter Template
                </Label>
                <span className="text-[11px] text-muted-foreground">Choose a format to begin</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {TEMPLATES.map((t) => {
                  const isSelected = t.id === selectedTemplateId;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'border-teal-500/60 bg-teal-500/10 dark:bg-teal-500/15 shadow-xs'
                          : 'border-border hover:border-border/80 hover:bg-muted/40'
                      }`}
                    >
                      <div
                        className={`p-1.5 rounded-lg shrink-0 ${
                          isSelected
                            ? 'bg-teal-500/20 text-teal-600 dark:text-teal-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-xs font-semibold truncate ${
                            isSelected ? 'text-teal-950 dark:text-teal-200' : 'text-foreground'
                          }`}
                        >
                          {t.name}
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                          {t.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="p-4 bg-muted/30 border-t border-border flex flex-col sm:flex-row items-center justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isLoading}
              className="w-full sm:w-auto text-xs cursor-pointer"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !title.trim()}
              className="w-full sm:w-auto text-xs bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
            >
              {isLoading ? 'Creating...' : 'Create Document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
