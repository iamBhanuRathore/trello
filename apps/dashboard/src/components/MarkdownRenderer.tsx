import { useState, type ReactNode } from 'react';
import { Copy, Check, ExternalLink, AtSign } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onToggleTask?: (newContent: string) => void;
}

export function MarkdownRenderer({ content, className = '', onToggleTask }: MarkdownRendererProps) {
  if (!content || !content.trim()) {
    return <p className="text-muted-foreground italic text-xs">No description provided yet.</p>;
  }

  // Handle task checkbox click by replacing the exact checkbox state at lineIndex
  const handleCheckboxClick = (lineIndex: number, isChecked: boolean) => {
    if (!onToggleTask) return;
    const lines = content.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const line = lines[lineIndex];
    let updatedLine = line;
    if (isChecked) {
      // Turn checked into unchecked: [x] or [X] -> [ ]
      updatedLine = line.replace(/^(\s*[-*]\s+)\[[xX]\]/, '$1[ ]');
    } else {
      // Turn unchecked into checked: [ ] -> [x]
      updatedLine = line.replace(/^(\s*[-*]\s+)\[\s?\]/, '$1[x]');
    }

    lines[lineIndex] = updatedLine;
    onToggleTask(lines.join('\n'));
  };

  // Helper to parse inline markdown (bold, italic, code, links, strikethrough)
  const renderInline = (text: string): ReactNode[] => {
    const elements: ReactNode[] = [];
    let key = 0;

    // Pattern for inline code, mentions, images, links, bold, italic, strikethrough
    const inlineRegex =
      /(`[^`]+`)|(@\[([^\]]+)\]\(([^)]+)\))|(@[A-Za-z0-9_.-]+(?:\s+[A-Za-z0-9_.-]+)?(?=\s|[.,!?]|$))|(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = inlineRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        elements.push(text.substring(lastIndex, match.index));
      }

      if (match[1]) {
        // Inline code `code`
        const codeContent = match[1].slice(1, -1);
        elements.push(
          <code
            key={key++}
            className="px-1.5 py-0.5 mx-0.5 rounded bg-muted/80 text-primary font-mono text-[11px] border border-border/60"
          >
            {codeContent}
          </code>
        );
      } else if (match[2]) {
        // Structured mention @[User Name](userId)
        const userName = match[3];
        elements.push(
          <span
            key={key++}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-primary/15 text-primary border border-primary/25 font-semibold text-[11px] shadow-2xs hover:bg-primary/25 transition-colors cursor-default"
            title={`Mentioned user: ${userName}`}
          >
            <AtSign className="w-2.5 h-2.5 inline" />
            <span>{userName}</span>
          </span>
        );
      } else if (match[5]) {
        // Simple mention @username or @First Last
        const mentionName = match[5].startsWith('@') ? match[5].slice(1) : match[5];
        elements.push(
          <span
            key={key++}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-primary/15 text-primary border border-primary/25 font-semibold text-[11px] shadow-2xs hover:bg-primary/25 transition-colors cursor-default"
            title={`Mentioned user: ${mentionName}`}
          >
            <AtSign className="w-2.5 h-2.5 inline" />
            <span>{mentionName}</span>
          </span>
        );
      } else if (match[6]) {
        // Image ![alt](url)
        const imgAlt = match[7];
        const imgUrl = match[8];
        elements.push(
          <a
            key={key++}
            href={imgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block my-1.5 max-w-sm rounded-xl overflow-hidden border border-border/80 hover:opacity-95 transition-opacity"
            title={imgAlt || 'View full image'}
          >
            <img
              src={imgUrl}
              alt={imgAlt || 'Attachment'}
              className="max-h-64 w-auto rounded-xl object-contain bg-black/5"
            />
          </a>
        );
      } else if (match[9]) {
        // Link [text](url)
        const linkText = match[10];
        const linkUrl = match[11];
        elements.push(
          <a
            key={key++}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline font-medium"
          >
            <span>{linkText}</span>
            <ExternalLink className="w-2.5 h-2.5 inline" />
          </a>
        );
      } else if (match[12]) {
        // Bold **text**
        elements.push(
          <strong key={key++} className="font-bold text-foreground">
            {match[13]}
          </strong>
        );
      } else if (match[14]) {
        // Italic *text*
        elements.push(
          <em key={key++} className="italic text-foreground/90">
            {match[15]}
          </em>
        );
      } else if (match[16]) {
        // Strikethrough ~~text~~
        elements.push(
          <span key={key++} className="line-through text-muted-foreground">
            {match[17]}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }

    return elements.length > 0 ? elements : [text];
  };

  // Block parser
  const lines = content.split('\n');
  const nodes: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  let blockIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        const fullCode = codeBlockLines.join('\n');
        nodes.push(
          <CodeBlock key={`code-${blockIndex++}`} code={fullCode} language={codeBlockLang} />
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={`hr-${blockIndex++}`} className="my-4 border-border/80" />);
      continue;
    }

    // Headings (#, ##, ###, ####)
    if (line.startsWith('# ')) {
      nodes.push(
        <h1
          key={`h1-${blockIndex++}`}
          className="text-lg font-bold text-foreground mt-4 mb-2 pb-1 border-b border-border/60 first:mt-0"
        >
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(
        <h2
          key={`h2-${blockIndex++}`}
          className="text-base font-bold text-foreground mt-3.5 mb-1.5 first:mt-0"
        >
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      nodes.push(
        <h3
          key={`h3-${blockIndex++}`}
          className="text-xs font-bold uppercase tracking-wider text-primary mt-3 mb-1.5 flex items-center gap-1.5 first:mt-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
          <span>{renderInline(line.slice(4))}</span>
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      nodes.push(
        <h4
          key={`h4-${blockIndex++}`}
          className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2.5 mb-1 first:mt-0"
        >
          {renderInline(line.slice(5))}
        </h4>
      );
      continue;
    }

    // Blockquote (> )
    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote
          key={`quote-${blockIndex++}`}
          className="my-2 pl-3 py-1 border-l-2 border-primary/70 bg-primary/5 rounded-r-lg text-xs italic text-muted-foreground"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Task List Item (- [ ] or - [x] or * [ ] or * [x])
    const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      const isChecked = taskMatch[2].toLowerCase() === 'x';
      const taskText = taskMatch[3];
      const indentLevel = Math.floor(taskMatch[1].length / 2);

      nodes.push(
        <div
          key={`task-${i}`}
          style={{ marginLeft: `${indentLevel * 1.25}rem` }}
          className={`flex items-start gap-2.5 py-1 px-1.5 rounded-lg transition-colors group ${
            onToggleTask ? 'cursor-pointer hover:bg-muted/40' : ''
          }`}
          onClick={() => onToggleTask && handleCheckboxClick(i, isChecked)}
        >
          <button
            type="button"
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleCheckboxClick(i, isChecked);
            }}
          >
            {isChecked ? (
              <div className="w-4 h-4 rounded bg-primary text-primary-foreground flex items-center justify-center shadow-2xs">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded border border-border/80 group-hover:border-primary/80 transition-colors bg-background/50" />
            )}
          </button>
          <span
            className={`text-xs leading-relaxed ${
              isChecked ? 'line-through text-muted-foreground/80' : 'text-foreground font-medium'
            }`}
          >
            {renderInline(taskText)}
          </span>
        </div>
      );
      continue;
    }

    // Bullet List Item (- or *)
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      const bulletText = bulletMatch[2];
      const indentLevel = Math.floor(bulletMatch[1].length / 2);
      nodes.push(
        <div
          key={`bullet-${blockIndex++}`}
          style={{ marginLeft: `${indentLevel * 1.25}rem` }}
          className="flex items-start gap-2 py-0.5 text-xs text-foreground leading-relaxed"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 mt-1.5 shrink-0" />
          <span className="flex-1">{renderInline(bulletText)}</span>
        </div>
      );
      continue;
    }

    // Numbered List Item (1. )
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const num = numberedMatch[2];
      const numText = numberedMatch[3];
      const indentLevel = Math.floor(numberedMatch[1].length / 2);
      nodes.push(
        <div
          key={`num-${blockIndex++}`}
          style={{ marginLeft: `${indentLevel * 1.25}rem` }}
          className="flex items-start gap-2 py-0.5 text-xs text-foreground leading-relaxed"
        >
          <span className="font-mono text-[11px] font-bold text-primary mt-0.5 shrink-0">
            {num}.
          </span>
          <span className="flex-1">{renderInline(numText)}</span>
        </div>
      );
      continue;
    }

    // Empty Line
    if (!line.trim()) {
      nodes.push(<div key={`space-${blockIndex++}`} className="h-2" />);
      continue;
    }

    // Standard Paragraph
    nodes.push(
      <p key={`p-${blockIndex++}`} className="text-xs text-foreground/90 leading-relaxed my-1">
        {renderInline(line)}
      </p>
    );
  }

  // Handle unclosed code block if any
  if (inCodeBlock && codeBlockLines.length > 0) {
    nodes.push(
      <CodeBlock
        key={`code-${blockIndex++}`}
        code={codeBlockLines.join('\n')}
        language={codeBlockLang}
      />
    );
  }

  return <div className={`space-y-0.5 ${className}`}>{nodes}</div>;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-border/80 bg-muted/40 overflow-hidden text-xs shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b border-border/60 text-[11px] font-mono text-muted-foreground">
        <span>{language || 'code'}</span>
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground transition-colors p-0.5 cursor-pointer"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] text-emerald-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 font-mono overflow-x-auto text-foreground/90 leading-relaxed text-[11px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
