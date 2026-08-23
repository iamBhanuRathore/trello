import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchService } from '../lib/searchService';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { Button } from '@boardly/ui/button';
import { Search, SearchIcon, X, Bookmark, Folder, Layout, CreditCard } from 'lucide-react';
// import { useDebounce } from '../hooks/useDebounce'; // Assuming we have this, or I will create a simple debounce logic

// Helper hook for debouncing search query
function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function SearchPalette({ triggerContext }: { triggerContext?: 'navbar' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounceValue(query, 300);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch search results
  const { data: results, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchService.search(debouncedQuery),
    enabled: debouncedQuery.length > 1,
  });

  // Fetch saved searches
  const { data: savedSearches } = useQuery({
    queryKey: ['savedSearches'],
    queryFn: () => searchService.getSavedSearches(),
  });

  const saveSearchMutation = useMutation({
    mutationFn: (name: string) => searchService.createSavedSearch({ name, query }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedSearches'] }),
  });

  const deleteSavedSearchMutation = useMutation({
    mutationFn: (id: string) => searchService.deleteSavedSearch(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedSearches'] }),
  });

  // Global hotkey Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (item: any) => {
    setOpen(false);
    if (item.type === 'project') navigate(`/`);
    if (item.type === 'board') navigate(`/b/${item.id}`);
    if (item.type === 'card') navigate(`/b/${item.boardId}?card=${item.id}`);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'project':
        return <Folder className="h-4 w-4" />;
      case 'board':
        return <Layout className="h-4 w-4" />;
      case 'card':
        return <CreditCard className="h-4 w-4" />;
      default:
        return <SearchIcon className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerContext === 'navbar' ? (
        <DialogTrigger
          render={
            <button className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-input bg-background text-muted-foreground shadow-xs w-[200px] lg:w-[300px] justify-start relative h-8 px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          }
        >
          <SearchIcon className="mr-2 h-4 w-4" />
          <span className="hidden lg:inline-flex">Search boards, cards...</span>
          <span className="inline-flex lg:hidden">Search...</span>
          <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 w-9" />
          }
        >
          <SearchIcon className="h-5 w-5" />
        </DialogTrigger>
      )}
      <DialogContent className="p-0 overflow-hidden sm:max-w-[600px]">
        <div className="flex items-center border-b px-3 h-14">
          <Search className="mr-2 h-5 w-5 shrink-0 opacity-50" />
          <Input
            autoFocus
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground border-0 focus-visible:ring-0"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.length > 2 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs shrink-0 px-2"
              onClick={() => saveSearchMutation.mutate(`Search: ${query}`)}
            >
              <Bookmark className="h-3 w-3 mr-1" /> Save
            </Button>
          )}
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          {isLoading && query.length > 1 && (
            <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
          )}

          {!isLoading && results?.length > 0 && (
            <div className="mb-4">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Results</div>
              {results.map((r: any) => (
                <div
                  key={`${r.type}-${r.id}`}
                  className="flex cursor-pointer items-center rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleSelect(r)}
                >
                  <span className="mr-2 opacity-50">{getIcon(r.type)}</span>
                  <span className="font-medium mr-2">{r.title}</span>
                  <span className="text-xs text-muted-foreground uppercase opacity-75 ml-auto">
                    {r.type}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!isLoading && query.length > 1 && results?.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">No results found.</div>
          )}

          {query.length === 0 && savedSearches?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Saved Searches
              </div>
              {savedSearches.map((ss: any) => (
                <div
                  key={ss.id}
                  className="group flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex items-center flex-1" onClick={() => setQuery(ss.query)}>
                    <Bookmark className="mr-2 h-4 w-4 opacity-50" />
                    <span>{ss.name}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedSearchMutation.mutate(ss.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {query.length === 0 && (!savedSearches || savedSearches.length === 0) && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Start typing to search across your workspace...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
