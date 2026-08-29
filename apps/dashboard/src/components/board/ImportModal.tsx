import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importTrelloBoard, importTasksData } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import {
  UploadCloud,
  FileJson,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
}

export function ImportModal({
  open,
  onOpenChange,
  projectId,
  projectName,
}: ImportModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedData, setParsedData] = useState<any>(null);
  const [importType, setImportType] = useState<'trello' | 'tasks' | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const importTrelloMutation = useMutation({
    mutationFn: async (data: any) => await importTrelloBoard(projectId, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      onOpenChange(false);
      if (res?.board?.id) {
        navigate(`/b/${res.board.id}`);
      }
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error || err.message || 'Import failed');
    },
  });

  const importTasksMutation = useMutation({
    mutationFn: async (data: any) => await importTasksData(projectId, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['boards', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      onOpenChange(false);
      if (res?.board?.id) {
        navigate(`/b/${res.board.id}`);
      }
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error || err.message || 'Import failed');
    },
  });

  const handleFileChange = (file: File) => {
    setErrorMsg('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);

        // Detect Trello format
        if (json.cards && json.lists) {
          setImportType('trello');
          setParsedData(json);
        } else if (json.boardName && json.lists) {
          setImportType('tasks');
          setParsedData(json);
        } else {
          setErrorMsg(
            'Unrecognized format. Please provide a standard Trello JSON export or Boardly task schema.'
          );
          setParsedData(null);
        }
      } catch (err) {
        setErrorMsg('Invalid JSON file format.');
        setParsedData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleStartImport = () => {
    if (!parsedData) return;
    if (importType === 'trello') {
      importTrelloMutation.mutate(parsedData);
    } else if (importType === 'tasks') {
      importTasksMutation.mutate(parsedData);
    }
  };

  const isPending = importTrelloMutation.isPending || importTasksMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        {/* ─── Fixed Header ─── */}
        <DialogHeader className="p-5 sm:px-6 border-b border-border/80 bg-card/90 backdrop-blur-md shrink-0 space-y-1">
          <div className="flex items-center gap-2.5 pr-8">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Migrate / Import Board</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Import a Trello board or JSON export into <strong>{projectName || 'your project'}</strong>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ─── Scrollable Body ─── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              parsedData
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-muted hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            {parsedData ? (
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="font-semibold text-sm">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {importType === 'trello' ? 'Trello Board Export' : 'Structured Task List'} detected.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <FileJson className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium">Click or drag your JSON export here</p>
                <p className="text-xs text-muted-foreground">
                  Supports Trello JSON export (Lists, Cards, Checklists, Labels)
                </p>
              </div>
            )}
          </div>

          {/* Error state */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Preview Details */}
          {parsedData && (
            <div className="p-4 rounded-xl border bg-card/80 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Board Preview
                </span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {parsedData.name || parsedData.boardName || 'Untitled Board'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-muted/40">
                  <span className="font-bold block text-sm">
                    {Array.isArray(parsedData.lists)
                      ? parsedData.lists.filter((l: any) => !l.closed).length
                      : 0}
                  </span>
                  <span className="text-muted-foreground text-[10px]">Lists</span>
                </div>

                <div className="p-2 rounded bg-muted/40">
                  <span className="font-bold block text-sm">
                    {importType === 'trello'
                      ? Array.isArray(parsedData.cards)
                        ? parsedData.cards.filter((c: any) => !c.closed).length
                        : 0
                      : parsedData.lists?.reduce((acc: number, l: any) => acc + (l.tasks?.length || 0), 0) || 0}
                  </span>
                  <span className="text-muted-foreground text-[10px]">Cards</span>
                </div>

                <div className="p-2 rounded bg-muted/40">
                  <span className="font-bold block text-sm">
                    {importType === 'trello' ? parsedData.checklists?.length || 0 : '—'}
                  </span>
                  <span className="text-muted-foreground text-[10px]">Checklists</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Fixed Bottom Footer ─── */}
        <div className="p-4 sm:px-6 border-t border-border/80 bg-card/90 backdrop-blur-md shrink-0 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="cursor-pointer text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer text-xs"
            onClick={handleStartImport}
            disabled={!parsedData || isPending}
          >
            {isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Start Migration <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
