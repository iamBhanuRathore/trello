import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { CreateDocumentModal } from '../components/docs/CreateDocumentModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import {
  getProjectDocs,
  getDoc,
  createDoc,
  updateDoc,
  deleteDoc,
  linkCardToDoc,
  unlinkCardFromDoc,
} from '../lib/api';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  Check,
  ArrowLeft,
  Link2,
  FileText,
  Search,
  ExternalLink,
  Code,
  List,
  Heading,
  Bold,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';

export function ProjectDocs() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLinkingCard, setIsLinkingCard] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<{ id: string; title: string } | null>(null);

  // 1. Fetch Project Documents
  const { data: docs = [], isLoading: isDocsLoading } = useQuery({
    queryKey: ['projectDocs', projectId],
    queryFn: () => getProjectDocs(projectId!),
    enabled: !!projectId,
  });

  // Set active doc if none selected
  const activeDocId = selectedDocId || docs[0]?.id;

  // 2. Fetch Active Document with Linked Cards
  const { data: activeDoc } = useQuery({
    queryKey: ['doc', activeDocId],
    queryFn: () => getDoc(activeDocId!),
    enabled: !!activeDocId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; content?: string }) =>
      createDoc(projectId!, payload),
    onSuccess: (newDoc) => {
      queryClient.invalidateQueries({ queryKey: ['projectDocs', projectId] });
      setSelectedDocId(newDoc.id);
      setIsEditing(false);
      setIsCreateModalOpen(false);
      toast.success('Document created successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create document');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { title?: string; content?: string }) =>
      updateDoc(activeDocId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectDocs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['doc', activeDocId] });
      setIsEditing(false);
      toast.success('Document updated successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update document');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDoc(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectDocs', projectId] });
      setSelectedDocId(null);
      setDocToDelete(null);
      toast.success('Document deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete document');
    },
  });

  const linkCardMutation = useMutation({
    mutationFn: (cardId: string) => linkCardToDoc(activeDocId!, cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doc', activeDocId] });
      setIsLinkingCard(false);
      setCardSearchQuery('');
      toast.success('Task card linked to document');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to link task card');
    },
  });

  const unlinkCardMutation = useMutation({
    mutationFn: (cardId: string) => unlinkCardFromDoc(activeDocId!, cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doc', activeDocId] });
      toast.success('Task card unlinked');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to unlink task card');
    },
  });

  const handleStartCreate = () => {
    setIsCreateModalOpen(true);
  };

  const handleStartEdit = () => {
    if (activeDoc) {
      setDocTitle(activeDoc.title);
      setDocContent(activeDoc.content || '');
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (!docTitle.trim()) return;
    updateMutation.mutate({
      title: docTitle,
      content: docContent,
    });
  };

  const insertMarkdown = (snippet: string) => {
    setDocContent((prev) => prev + snippet);
  };

  const filteredDocs = docs.filter((d: any) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              to="/"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Project Docs & Knowledge Base</h1>
              <p className="text-sm text-muted-foreground">
                Collaborative technical specifications, RFCs, wikis, and task requirements.
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleStartCreate} className="gap-2 bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="w-4 h-4" /> New Document
        </Button>
      </div>

      {/* Main Grid: Sidebar Docs List & Document Viewer */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[600px]">
        {/* Sidebar (4 Cols) */}
        <div className="md:col-span-4 p-4 rounded-2xl border bg-card/80 shadow-xs flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Doc List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pt-1">
            {isDocsLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Loading docs...</div>
            ) : filteredDocs.length > 0 ? (
              filteredDocs.map((doc: any) => {
                const isSelected = doc.id === activeDocId;
                return (
                  <button
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocId(doc.id);
                      setIsEditing(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-teal-500/10 border-teal-500/30 text-teal-950 dark:text-teal-200'
                        : 'hover:bg-muted/50 border-transparent text-foreground'
                    }`}
                  >
                    <FileText
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-muted-foreground'
                      }`}
                    />
                    <div className="flex-1 truncate">
                      <p className="font-semibold truncate">{doc.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        By {doc.author?.name} • {new Date(doc.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                No documents found. Click &quot;New Document&quot; to create one.
              </div>
            )}
          </div>
        </div>

        {/* Document Editor / Viewer (8 Cols) */}
        <div className="md:col-span-8 p-6 rounded-2xl border bg-card/80 shadow-xs flex flex-col justify-between space-y-6">
          {activeDoc ? (
            <div className="space-y-6 flex-1">
              {/* Document Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                {isEditing ? (
                  <Input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="text-lg font-bold h-10 max-w-md"
                  />
                ) : (
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">{activeDoc.title}</h2>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      slug: {activeDoc.slug} • Last updated {new Date(activeDoc.updatedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditing(false)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                        className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs"
                      >
                        <Check className="w-3.5 h-3.5" /> Save Changes
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleStartEdit}
                        className="gap-1.5 text-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Document
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDocToDelete({ id: activeDoc.id, title: activeDoc.title });
                        }}
                        className="text-xs text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Document Content */}
              {isEditing ? (
                <div className="space-y-3">
                  {/* Markdown Helper Toolbar */}
                  <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-muted/40 border text-xs">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => insertMarkdown('\n\n## Section Title\n')}
                      title="Heading"
                    >
                      <Heading className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => insertMarkdown('**bold text**')}
                      title="Bold"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => insertMarkdown('\n- Item 1\n- Item 2\n')}
                      title="Bullet List"
                    >
                      <List className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => insertMarkdown('\n```typescript\n// code here\n```\n')}
                      title="Code Block"
                    >
                      <Code className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <textarea
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    className="w-full min-h-[300px] p-4 rounded-xl bg-muted/20 border text-sm font-mono focus:ring-1 focus:ring-primary outline-none resize-y"
                    placeholder="Write markdown specification..."
                  />
                </div>
              ) : (
                <div className="text-sm text-foreground min-h-[200px] p-2">
                  <MarkdownRenderer content={activeDoc.content} />
                </div>
              )}

              {/* Linked Cards / Tasks Section */}
              <div className="border-t pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                      Linked Tasks & Work Items ({activeDoc.linkedCards?.length || 0})
                    </h3>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setIsLinkingCard(!isLinkingCard)}
                  >
                    <Plus className="w-3 h-3" /> Link Task Card
                  </Button>
                </div>

                {/* Inline Link Task Box */}
                {isLinkingCard && (
                  <div className="p-3 rounded-xl bg-muted/30 border space-y-2">
                    <Label className="text-xs text-muted-foreground">Enter Card ID to Link:</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. paste card ID"
                        value={cardSearchQuery}
                        onChange={(e) => setCardSearchQuery(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                        onClick={() => cardSearchQuery && linkCardMutation.mutate(cardSearchQuery)}
                        disabled={linkCardMutation.isPending || !cardSearchQuery}
                      >
                        Connect
                      </Button>
                    </div>
                  </div>
                )}

                {/* Linked Cards Pills */}
                {activeDoc.linkedCards && activeDoc.linkedCards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {activeDoc.linkedCards.map((card: any) => (
                      <div
                        key={card.id}
                        className="p-3 rounded-xl border bg-muted/20 flex items-center justify-between hover:bg-muted/40 transition-colors group"
                      >
                        <div className="truncate">
                          <Link
                            to={`/b/${card.boardId}`}
                            className="font-medium text-xs text-foreground hover:underline flex items-center gap-1 truncate"
                          >
                            <span>{card.title}</span>
                            <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          </Link>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {card.boardName} &gt; {card.listName}
                          </p>
                        </div>
                        <button
                          onClick={() => unlinkCardMutation.mutate(card.id)}
                          className="opacity-0 group-hover:opacity-100 hover:text-rose-500 p-1 transition-opacity"
                          title="Unlink card"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No task cards linked to this specification yet.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="m-auto text-center text-muted-foreground text-sm space-y-2 py-12">
              <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p>Select a document from the left or create a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Document Modal */}
      <CreateDocumentModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        isLoading={createMutation.isPending}
        onCreate={(doc) => {
          createMutation.mutate(doc);
        }}
      />

      {/* Delete Document Confirmation Dialog */}
      <ConfirmDialog
        open={!!docToDelete}
        onOpenChange={(open) => {
          if (!open) setDocToDelete(null);
        }}
        title="Delete Document"
        description={`Are you sure you want to permanently delete "${docToDelete?.title || 'this document'}"? This action cannot be undone.`}
        confirmLabel="Delete Document"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (docToDelete) {
            deleteMutation.mutate(docToDelete.id);
          }
        }}
      />
    </div>
  );
}
