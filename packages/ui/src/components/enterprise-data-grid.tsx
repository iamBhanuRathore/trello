import React, { useState, useMemo, useRef, useEffect, memo } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  FileSpreadsheet,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessorKey?: keyof T;
  accessorFn?: (row: T) => any;
  cell?: (info: { row: T; value: any; index: number }) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean; // Enables Excel-like multi-select value filter
  width?: string;
  align?: 'left' | 'center' | 'right';
  exportValue?: (row: T) => string;
}

export interface EnterpriseDataGridProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  defaultPageSize?: number;
  pageSize?: number; // Alias for defaultPageSize or serverPageSize
  pageSizeOptions?: number[];
  enableGlobalSearch?: boolean;
  searchable?: boolean; // Alias for enableGlobalSearch
  globalSearchPlaceholder?: string;
  enableExport?: boolean;
  exportable?: boolean; // Alias for enableExport
  exportFileName?: string;
  exportFilename?: string; // Alias for exportFileName
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  // Query failure state — rendered instead of the empty state when the fetch
  // failed and there is no data to show (stale data keeps rendering otherwise).
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  // Server-side support
  serverSide?: boolean;
  totalCount?: number;
  pageIndex?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSortingChange?: (sort: { id: string; desc: boolean } | null) => void;
  onFilterChange?: (filters: Record<string, string[]>) => void;
  onRowClick?: (row: T) => void;
  headerActions?: React.ReactNode;
}

// ─── Module-scope pure helpers (stable identity: never bust memos) ──────────

// Cap rendered distinct-value checkboxes per filter popover. The full list is
// still used for select-all/counts; only the rendered DOM is capped.
const MAX_DISTINCT_RENDER = 500;

function getRawValue<T>(row: T, col: ColumnDef<T>): any {
  if (col.accessorFn) return col.accessorFn(row);
  if (col.accessorKey) return row[col.accessorKey];
  return (row as Record<string, any>)[col.id];
}

function getStringValue<T>(row: T, col: ColumnDef<T>): string {
  const val = getRawValue(row, col);
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val instanceof Date) return val.toISOString();
    if (val.name) return String(val.name);
    if (val.title) return String(val.title);
    return JSON.stringify(val);
  }
  return String(val);
}

// Precomputed sort key — computed once per row (Schwartzian transform) instead
// of re-parsing dates / lowercasing strings on every comparison.
type SortKey = { kind: 0; v: number } | { kind: 1; v: number } | { kind: 2; v: string };

function getSortKey(val: any): SortKey | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return { kind: 0, v: val };
  if (typeof val === 'string' && val.includes('-')) {
    const t = new Date(val).getTime();
    if (!isNaN(t)) return { kind: 1, v: t };
  }
  if (val instanceof Date) {
    const t = val.getTime();
    if (!isNaN(t)) return { kind: 1, v: t };
  }
  return { kind: 2, v: String(val).toLowerCase() };
}

function compareSortKeys(a: SortKey, b: SortKey, desc: boolean): number {
  if (a.kind !== b.kind) return a.kind - b.kind;
  if (a.v === b.v) return 0;
  const cmp = a.v < b.v ? -1 : 1;
  return desc ? -cmp : cmp;
}

// Memoized row — re-renders only when its own row/columns change, so toolbar
// typing (search, filter popover) doesn't re-render every visible row.
const GridRow = memo(function GridRow({
  row,
  columns,
  index,
  onRowClick,
}: {
  row: Record<string, any>;
  columns: ColumnDef<any>[];
  index: number;
  onRowClick?: (row: any) => void;
}) {
  return (
    <tr
      onClick={() => onRowClick && onRowClick(row)}
      className={`hover:bg-muted/30 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
    >
      {columns.map((col) => {
        const val = getRawValue(row, col);
        return (
          <td
            key={col.id}
            className={`py-3 px-4 ${
              col.align === 'center'
                ? 'text-center'
                : col.align === 'right'
                  ? 'text-right'
                  : 'text-left'
            }`}
          >
            {col.cell ? col.cell({ row, value: val, index }) : (val ?? '—')}
          </td>
        );
      })}
    </tr>
  );
});

export function EnterpriseDataGrid<T extends Record<string, any>>({
  columns,
  data,
  isLoading = false,
  defaultPageSize = 15,
  pageSize: propPageSize,
  pageSizeOptions = [15, 30, 50, 100],
  enableGlobalSearch: propEnableGlobalSearch,
  searchable,
  globalSearchPlaceholder = 'Search across all columns...',
  enableExport: propEnableExport,
  exportable,
  exportFileName: propExportFileName,
  exportFilename,
  title,
  subtitle,
  emptyMessage = 'No matching records found.',
  emptyIcon,
  isError = false,
  errorMessage = "Couldn't load data. Check your connection and try again.",
  onRetry,
  serverSide = false,
  totalCount: serverTotalCount,
  pageIndex: serverPageIndex,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
  onFilterChange,
  onRowClick,
  headerActions,
}: EnterpriseDataGridProps<T>) {
  const enableGlobalSearch =
    searchable !== undefined ? searchable : (propEnableGlobalSearch ?? true);
  const enableExport = exportable !== undefined ? exportable : (propEnableExport ?? true);
  const exportFileName = exportFilename || propExportFileName || 'data_export';
  const effectiveDefaultPageSize = propPageSize || defaultPageSize;

  // ─── Local State ─────────────────────────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState('');
  // Debounced query drives the expensive filter — typing stays instant while
  // the O(rows × cols) scan runs at most once per pause.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(globalSearch), 200);
    return () => clearTimeout(t);
  }, [globalSearch]);
  const [sortState, setSortState] = useState<{ columnId: string; desc: boolean } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(effectiveDefaultPageSize);

  // Active filter popover column ID
  const [activeFilterColId, setActiveFilterColId] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Close filter popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setActiveFilterColId(null);
        setFilterSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // O(1) column lookup — avoids columns.find() per row per filter/sort pass.
  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  // Selected filter values as Sets — O(1) membership per row instead of
  // Array.includes() inside the row loop.
  const columnFilterSets = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [colId, vals] of Object.entries(columnFilters)) {
      if (vals && vals.length > 0) map.set(colId, new Set(vals));
    }
    return map;
  }, [columnFilters]);

  // ─── Lazy distinct values: only for the open filter popover ────────────────
  // Previously this scanned ALL filterable columns × ALL rows on every data
  // change. Now it runs only for the column the user actually opened.
  const activeDistinctValues = useMemo(() => {
    if (!activeFilterColId) return [] as Array<{ value: string; count: number }>;
    const col = columnById.get(activeFilterColId);
    if (!col) return [] as Array<{ value: string; count: number }>;
    const countMap = new Map<string, number>();
    for (let i = 0; i < data.length; i++) {
      const strVal = getStringValue(data[i], col) || '(Blank)';
      countMap.set(strVal, (countMap.get(strVal) || 0) + 1);
    }
    const list = Array.from(countMap.entries()).map(([value, count]) => ({
      value,
      count,
    }));
    list.sort((a, b) => a.value.localeCompare(b.value));
    return list;
  }, [activeFilterColId, data, columnById]);

  // ─── Filter & Search Handling ───────────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    return Object.keys(columnFilters).filter((k) => (columnFilters[k]?.length || 0) > 0).length;
  }, [columnFilters]);

  const clearAllFilters = () => {
    setColumnFilters({});
    setGlobalSearch('');
    setCurrentPage(1);
    if (onFilterChange) onFilterChange({});
  };

  const handleToggleFilterValue = (columnId: string, val: string) => {
    const currentSelected = columnFilters[columnId] || [];
    let updated: string[];

    if (currentSelected.includes(val)) {
      updated = currentSelected.filter((v) => v !== val);
    } else {
      updated = [...currentSelected, val];
    }

    const nextFilters = {
      ...columnFilters,
      [columnId]: updated,
    };
    if (updated.length === 0) {
      delete nextFilters[columnId];
    }

    setColumnFilters(nextFilters);
    setCurrentPage(1);
    if (onFilterChange) onFilterChange(nextFilters);
  };

  const handleSelectAllColumnValues = (columnId: string, allValues: string[]) => {
    const current = columnFilters[columnId] || [];
    let nextFilters: Record<string, string[]>;

    if (current.length === allValues.length) {
      // Deselect all
      nextFilters = { ...columnFilters };
      delete nextFilters[columnId];
    } else {
      // Select all
      nextFilters = {
        ...columnFilters,
        [columnId]: allValues,
      };
    }

    setColumnFilters(nextFilters);
    setCurrentPage(1);
    if (onFilterChange) onFilterChange(nextFilters);
  };

  // ─── Sorting Handler ────────────────────────────────────────────────────────
  const handleSortClick = (columnId: string) => {
    let nextSort: { columnId: string; desc: boolean } | null = null;
    if (!sortState || sortState.columnId !== columnId) {
      nextSort = { columnId, desc: false }; // Ascending
    } else if (!sortState.desc) {
      nextSort = { columnId, desc: true }; // Descending
    } else {
      nextSort = null; // Reset
    }

    setSortState(nextSort);
    if (onSortingChange)
      onSortingChange(nextSort ? { id: nextSort.columnId, desc: nextSort.desc } : null);
  };

  // ─── Processed Data (Filtered + Sorted) ─────────────────────────────────────
  const processedData = useMemo(() => {
    if (serverSide) return data;

    let result = data;

    // 1. Global Search — single pre-lowercased haystack per row, one pass.
    const q = debouncedSearch.toLowerCase().trim();
    if (q) {
      result = result.filter((row) => {
        for (let i = 0; i < columns.length; i++) {
          if (getStringValue(row, columns[i]).toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    // 2. Column-Specific Excel Filters
    if (columnFilterSets.size > 0) {
      result = result.filter((row) => {
        for (const [colId, selected] of columnFilterSets) {
          const col = columnById.get(colId);
          if (!col) continue;
          const val = getStringValue(row, col) || '(Blank)';
          if (!selected.has(val)) return false;
        }
        return true;
      });
    }

    // 3. Sorting — Schwartzian transform: key computed once per row, so date
    // parsing / lowercasing happens O(n), not O(n log n).
    if (sortState) {
      const col = columnById.get(sortState.columnId);
      if (col) {
        const desc = sortState.desc;
        const decorated: Array<{ row: T; key: SortKey | null }> = new Array(result.length);
        for (let i = 0; i < result.length; i++) {
          decorated[i] = { row: result[i], key: getSortKey(getRawValue(result[i], col)) };
        }
        decorated.sort((a, b) => {
          if (a.key === null && b.key === null) return 0;
          if (a.key === null) return 1;
          if (b.key === null) return -1;
          return compareSortKeys(a.key, b.key, desc);
        });
        result = decorated.map((d) => d.row);
      }
    }

    return result;
  }, [data, columns, columnById, debouncedSearch, columnFilterSets, sortState, serverSide]);

  // ─── Pagination Calculations ────────────────────────────────────────────────
  const activePageIndex = serverSide ? (serverPageIndex ?? 1) : currentPage;
  const activePageSize = serverSide ? (propPageSize ?? pageSize) : pageSize;
  const totalItems = serverSide ? (serverTotalCount ?? 0) : processedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / activePageSize));

  const paginatedData = useMemo(() => {
    if (serverSide) return data;
    const start = (activePageIndex - 1) * activePageSize;
    return processedData.slice(start, start + activePageSize);
  }, [processedData, activePageIndex, activePageSize, serverSide, data]);

  const handlePageChange = (page: number) => {
    const target = Math.max(1, Math.min(page, totalPages));
    if (serverSide) {
      if (onPageChange) onPageChange(target);
    } else {
      setCurrentPage(target);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (serverSide) {
      if (onPageSizeChange) onPageSizeChange(newSize);
    } else {
      setPageSize(newSize);
      setCurrentPage(1);
    }
  };

  // Generate page numbers with ellipsis
  const pageNumbers = useMemo(() => {
    const pages: Array<number | '...'> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (activePageIndex <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (activePageIndex >= totalPages - 3) {
        pages.push(
          1,
          '...',
          totalPages - 4,
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages
        );
      } else {
        pages.push(
          1,
          '...',
          activePageIndex - 1,
          activePageIndex,
          activePageIndex + 1,
          '...',
          totalPages
        );
      }
    }
    return pages;
  }, [totalPages, activePageIndex]);

  // ─── CSV Export (Blob-based: no encodeURI size limits on large dumps) ───────
  const exportToCSV = () => {
    const exportColumns = columns.filter((c) => c.id !== 'actions' && c.id !== 'action');
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const chunks: string[] = [exportColumns.map((c) => escape(c.header)).join(',')];

    for (let i = 0; i < processedData.length; i++) {
      const row = processedData[i];
      let line = '';
      for (let j = 0; j < exportColumns.length; j++) {
        const col = exportColumns[j];
        const val = col.exportValue ? col.exportValue(row) : getStringValue(row, col);
        line += (j > 0 ? ',' : '') + escape(val);
      }
      chunks.push(line);
    }

    const blob = new Blob(['\uFEFF' + chunks.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${exportFileName}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden flex flex-col transition-all">
      {/* ─── Top Controls Toolbar ─── */}
      <div className="p-4 sm:p-5 border-b border-border/80 bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Title / Subtitle */}
        <div>
          {title && <h3 className="font-bold text-base text-foreground tracking-tight">{title}</h3>}
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          ) : (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono">
                {totalItems} {totalItems === 1 ? 'record' : 'total records'}
              </span>
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Global Search */}
          {enableGlobalSearch && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={globalSearchPlaceholder}
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 h-9 text-xs bg-background/80"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Reset Filters button */}
          {(activeFilterCount > 0 || globalSearch) && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllFilters}
              className="h-9 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer bg-background/80"
              title="Reset all active filters and search"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          )}

          {/* Export to CSV */}
          {enableExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={processedData.length === 0}
              className="h-9 px-3.5 rounded-xl border-border/80 bg-background/80 hover:bg-background text-foreground text-xs font-semibold gap-2 transition-all shadow-2xs hover:shadow-xs cursor-pointer group"
              title="Export filtered records to CSV spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
              <span>Export CSV</span>
            </Button>
          )}

          {/* Custom Header Actions */}
          {headerActions}
        </div>
      </div>

      {/* ─── Active Filter Tags Bar ─── */}
      {activeFilterCount > 0 && (
        <div className="px-4 sm:px-5 py-2.5 bg-muted/15 border-b border-border/60 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
            <Filter className="w-3 h-3 text-primary" /> Active Filters:
          </span>
          {Object.entries(columnFilters).map(([colId, vals]) => {
            const col = columns.find((c) => c.id === colId);
            if (!col || vals.length === 0) return null;
            return (
              <span
                key={colId}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium"
              >
                <span className="font-semibold text-foreground">{col.header}:</span>
                <span className="truncate max-w-[150px]">{vals.join(', ')}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...columnFilters };
                    delete next[colId];
                    setColumnFilters(next);
                    if (onFilterChange) onFilterChange(next);
                  }}
                  className="hover:bg-primary/20 rounded-full p-0.5 ml-0.5 text-primary hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline ml-1 cursor-pointer font-medium"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ─── Interactive Table Container ─── */}
      <div className="overflow-x-auto relative min-h-[300px]">
        <table className="w-full text-xs text-left border-collapse">
          {/* Table Header */}
          <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold text-[10px] select-none sticky top-0 z-10 backdrop-blur-md">
            <tr>
              {columns.map((col) => {
                const isFiltered = (columnFilters[col.id]?.length || 0) > 0;
                const isSorted = sortState?.columnId === col.id;
                const distinctList = activeFilterColId === col.id ? activeDistinctValues : [];

                return (
                  <th
                    key={col.id}
                    style={{ width: col.width }}
                    className={`py-3.5 px-4 transition-colors relative group/th ${
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                          ? 'text-right'
                          : 'text-left'
                    }`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'center'
                          ? 'justify-center'
                          : col.align === 'right'
                            ? 'justify-end'
                            : 'justify-start'
                      }`}
                    >
                      {/* Sortable Header Label */}
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSortClick(col.id)}
                          className="font-bold hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors group"
                        >
                          <span className={isSorted ? 'text-foreground font-bold' : ''}>
                            {col.header}
                          </span>
                          {isSorted ? (
                            sortState?.desc ? (
                              <ArrowDown className="w-3 h-3 text-primary stroke-[2.5]" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-primary stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 text-muted-foreground transition-opacity" />
                          )}
                        </button>
                      ) : (
                        <span className="font-bold">{col.header}</span>
                      )}

                      {/* Excel-Style Column Filter Button & Popover */}
                      {col.filterable && (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeFilterColId === col.id) {
                                setActiveFilterColId(null);
                                setFilterSearch('');
                              } else {
                                setActiveFilterColId(col.id);
                                setFilterSearch('');
                              }
                            }}
                            className={`p-1 rounded-md transition-all cursor-pointer ${
                              isFiltered
                                ? 'bg-primary/20 text-primary border border-primary/30 shadow-2xs'
                                : 'text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-60 group-hover/th:opacity-100'
                            }`}
                            title={`Filter by ${col.header}`}
                          >
                            <Filter className="w-3 h-3" />
                          </button>

                          {/* ─── Filter Popover ─── */}
                          {activeFilterColId === col.id && (
                            <div
                              ref={filterPopoverRef}
                              className="absolute left-0 mt-2 w-64 rounded-xl border border-border bg-popover/95 backdrop-blur-xl p-3 shadow-2xl z-50 normal-case text-foreground text-xs space-y-2.5 animate-in fade-in-50 zoom-in-95"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between border-b border-border/80 pb-2">
                                <span className="font-bold text-xs flex items-center gap-1.5">
                                  <Filter className="w-3.5 h-3.5 text-primary" /> Filter{' '}
                                  {col.header}
                                </span>
                                {isFiltered && (
                                  <button
                                    onClick={() => {
                                      const next = { ...columnFilters };
                                      delete next[col.id];
                                      setColumnFilters(next);
                                      if (onFilterChange) onFilterChange(next);
                                    }}
                                    className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>

                              {/* Search inside distinct values */}
                              <div className="relative">
                                <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-muted-foreground" />
                                <Input
                                  placeholder="Search values..."
                                  value={filterSearch}
                                  onChange={(e) => setFilterSearch(e.target.value)}
                                  className="h-7 pl-7 text-xs"
                                />
                              </div>

                              {/* Select All Checkbox */}
                              <div className="flex items-center justify-between px-1 py-0.5 text-[11px] font-semibold border-b border-border/60">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={
                                      (columnFilters[col.id]?.length || 0) ===
                                        distinctList.length && distinctList.length > 0
                                    }
                                    onChange={() =>
                                      handleSelectAllColumnValues(
                                        col.id,
                                        distinctList.map((d) => d.value)
                                      )
                                    }
                                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                                  />
                                  <span>(Select All)</span>
                                </label>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {distinctList.length} values
                                </span>
                              </div>

                              {distinctList.length > MAX_DISTINCT_RENDER && (
                                <p className="px-1 text-[10px] text-muted-foreground">
                                  Showing first {MAX_DISTINCT_RENDER} of {distinctList.length} —
                                  type to refine.
                                </p>
                              )}

                              {/* Unique values checkbox list */}
                              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                {distinctList
                                  .filter((item) =>
                                    item.value.toLowerCase().includes(filterSearch.toLowerCase())
                                  )
                                  .slice(0, MAX_DISTINCT_RENDER)
                                  .map((item) => {
                                    const checked =
                                      columnFilters[col.id]?.includes(item.value) ?? false;
                                    return (
                                      <label
                                        key={item.value}
                                        className="flex items-center justify-between p-1 rounded-md hover:bg-muted/50 cursor-pointer text-xs select-none transition-colors"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                              handleToggleFilterValue(col.id, item.value)
                                            }
                                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 shrink-0"
                                          />
                                          <span className="truncate text-foreground">
                                            {item.value}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.2 rounded shrink-0">
                                          {item.count}
                                        </span>
                                      </label>
                                    );
                                  })}
                              </div>

                              <div className="pt-2 border-t border-border flex justify-end">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs px-3"
                                  onClick={() => setActiveFilterColId(null)}
                                >
                                  Done
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="p-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Loading data...</span>
                  </div>
                </td>
              </tr>
            ) : isError && data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <AlertTriangle className="w-6 h-6 text-destructive/70 mb-1" />
                    <p className="font-semibold text-foreground text-sm">{errorMessage}</p>
                    {onRetry && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="text-xs h-7 mt-2"
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    {emptyIcon || <Sparkles className="w-6 h-6 text-muted-foreground/60 mb-1" />}
                    <p className="font-semibold text-foreground text-sm">{emptyMessage}</p>
                    {(activeFilterCount > 0 || globalSearch) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAllFilters}
                        className="text-xs h-7 mt-2"
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <GridRow
                  key={(row as any).id || idx}
                  row={row}
                  columns={columns}
                  index={idx}
                  onRowClick={onRowClick}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination Footer ─── */}
      <div className="p-3.5 sm:px-5 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        {/* Entry Range Info & Page Size Switcher */}
        <div className="flex items-center gap-3">
          <span>
            Showing{' '}
            <strong className="text-foreground">
              {totalItems === 0 ? 0 : (activePageIndex - 1) * activePageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-foreground">
              {Math.min(activePageIndex * activePageSize, totalItems)}
            </strong>{' '}
            of <strong className="text-foreground">{totalItems}</strong> entries
          </span>

          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <span className="text-[11px] hidden sm:inline">Rows per page:</span>
            <Select
              value={String(activePageSize)}
              onValueChange={(v) => handlePageSizeChange(Number(v))}
            >
              <SelectTrigger size="sm" className="w-[70px] font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Page Navigation Buttons */}
        <div className="flex items-center gap-1">
          {/* First page */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={activePageIndex <= 1}
            onClick={() => handlePageChange(1)}
            title="First page"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </Button>

          {/* Previous page */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={activePageIndex <= 1}
            onClick={() => handlePageChange(activePageIndex - 1)}
            title="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>

          {/* Page numbers */}
          {pageNumbers.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">
                ...
              </span>
            ) : (
              <Button
                key={`page-${p}`}
                variant={activePageIndex === p ? 'default' : 'ghost'}
                size="sm"
                className="h-7 min-w-[28px] px-2 text-xs"
                onClick={() => handlePageChange(p as number)}
              >
                {p}
              </Button>
            )
          )}

          {/* Next page */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={activePageIndex >= totalPages}
            onClick={() => handlePageChange(activePageIndex + 1)}
            title="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>

          {/* Last page */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={activePageIndex >= totalPages}
            onClick={() => handlePageChange(totalPages)}
            title="Last page"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
