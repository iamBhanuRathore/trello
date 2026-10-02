import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  useTable,
  tableFeatures,
  columnFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  columnFacetingFeature,
  globalFilteringFeature,
  createFilteredRowModel,
  createSortedRowModel,
  createPaginatedRowModel,
  createFacetedRowModel,
  createFacetedUniqueValues,
  filterFns,
  sortFns,
  flexRender,
  type ColumnDef as TanStackColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
} from '@tanstack/react-table';
import { Button } from './button';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
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
  SlidersHorizontal,
} from 'lucide-react';

export interface ColumnDef<T> {
  id: string;
  header: string | ((props: any) => React.ReactNode);
  accessorKey?: keyof T;
  accessorFn?: (row: T) => any;
  cell?: (info: { row: T; value: any; index: number }) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean; // Enables Excel-like multi-select value filter
  width?: string;
  align?: 'left' | 'center' | 'right';
  exportValue?: (row: T) => string;
  enableHiding?: boolean;
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
  enableColumnVisibility?: boolean; // Built-in TanStack Table column toggle
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  // Query failure state
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

const MAX_DISTINCT_RENDER = 500;

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
  enableColumnVisibility = true,
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

  // ─── Local State for TanStack Table ──────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(globalSearch), 200);
    return () => clearTimeout(t);
  }, [globalSearch]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: serverPageIndex ? serverPageIndex - 1 : 0,
    pageSize: effectiveDefaultPageSize,
  });

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

  // ─── Map to TanStack Table Column Definitions ────────────────────────────────
  const tanstackColumns = useMemo<TanStackColumnDef<any, any>[]>(() => {
    return columns.map((col) => {
      const base: any = {
        id: col.id,
        header: typeof col.header === 'string' ? col.header : () => col.header,
        enableSorting: col.sortable ?? false,
        enableColumnFilter: col.filterable ?? false,
        enableHiding: col.enableHiding ?? (col.id !== 'actions' && col.id !== 'action'),
        meta: {
          width: col.width,
          align: col.align,
          exportValue: col.exportValue,
          filterable: col.filterable,
          originalHeader: typeof col.header === 'string' ? col.header : col.id,
        },
      };

      if (col.accessorFn) {
        base.accessorFn = col.accessorFn;
      } else if (col.accessorKey) {
        base.accessorKey = col.accessorKey;
      } else {
        base.accessorFn = (row: T) => (row as any)[col.id];
      }

      // Filter function for multi-select Excel-like filter
      base.filterFn = (row: any, columnId: string, filterValue: string[]) => {
        if (!filterValue || filterValue.length === 0) return true;
        const val = row.getValue(columnId);
        const strVal = val === null || val === undefined || val === '' ? '(Blank)' : String(val);
        return filterValue.includes(strVal);
      };

      if (col.cell) {
        base.cell = (info: any) => {
          return col.cell!({
            row: info.row.original,
            value: info.getValue(),
            index: info.row.index,
          });
        };
      } else {
        base.cell = (info: any) => {
          const v = info.getValue();
          return v ?? '—';
        };
      }

      return base;
    });
  }, [columns]);

  // Global search evaluator across columns
  const globalFilterFn = useMemo(() => {
    return (row: any, _columnId: string, filterValue: string) => {
      if (!filterValue) return true;
      const q = String(filterValue).toLowerCase().trim();
      if (!q) return true;

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (col.id === 'actions' || col.id === 'action') continue;
        const raw = col.accessorFn
          ? col.accessorFn(row.original)
          : col.accessorKey
            ? row.original[col.accessorKey]
            : row.original[col.id];
        if (raw === null || raw === undefined) continue;
        let str = '';
        if (typeof raw === 'object') {
          if (raw instanceof Date) str = raw.toISOString();
          else if (raw.name) str = String(raw.name);
          else if (raw.title) str = String(raw.title);
          else str = JSON.stringify(raw);
        } else {
          str = String(raw);
        }
        if (str.toLowerCase().includes(q)) return true;
      }
      return false;
    };
  }, [columns]);

  // ─── TanStack Table v9 Feature Configuration ────────────────────────────────
  const [features] = useState(() =>
    tableFeatures({
      columnFilteringFeature,
      rowSortingFeature,
      rowPaginationFeature,
      columnVisibilityFeature,
      columnFacetingFeature,
      globalFilteringFeature,
      filteredRowModel: createFilteredRowModel(),
      sortedRowModel: createSortedRowModel(),
      paginatedRowModel: createPaginatedRowModel(),
      facetedRowModel: createFacetedRowModel(),
      facetedUniqueValues: createFacetedUniqueValues(),
      filterFns,
      sortFns,
    })
  );

  // ─── TanStack Table v9 Hook ─────────────────────────────────────────────────
  const table = useTable(
    {
      features,
      data,
      columns: tanstackColumns,
      globalFilterFn,
      state: {
        sorting,
        globalFilter: debouncedSearch,
        columnFilters,
        columnVisibility,
        pagination: {
          pageIndex: serverSide && serverPageIndex ? serverPageIndex - 1 : pagination.pageIndex,
          pageSize: serverSide && propPageSize ? propPageSize : pagination.pageSize,
        },
      },
      onSortingChange: (updaterOrValue) => {
        setSorting((old: SortingState) => {
          const next = typeof updaterOrValue === 'function' ? updaterOrValue(old) : updaterOrValue;
          if (onSortingChange) {
            onSortingChange(next.length > 0 ? { id: next[0].id, desc: next[0].desc } : null);
          }
          return next;
        });
      },
      onGlobalFilterChange: setDebouncedSearch,
      onColumnFiltersChange: (updaterOrValue) => {
        setColumnFilters((old: ColumnFiltersState) => {
          const next = typeof updaterOrValue === 'function' ? updaterOrValue(old) : updaterOrValue;
          if (onFilterChange) {
            const filterRecord: Record<string, string[]> = {};
            for (const f of next) {
              if (Array.isArray(f.value)) {
                filterRecord[f.id] = f.value as string[];
              }
            }
            onFilterChange(filterRecord);
          }
          return next;
        });
        table.setPageIndex(0);
      },
      onColumnVisibilityChange: setColumnVisibility,
      onPaginationChange: (updaterOrValue) => {
        setPagination((old: PaginationState) => {
          const next = typeof updaterOrValue === 'function' ? updaterOrValue(old) : updaterOrValue;
          if (serverSide) {
            if (onPageChange && next.pageIndex !== old.pageIndex) {
              onPageChange(next.pageIndex + 1);
            }
            if (onPageSizeChange && next.pageSize !== old.pageSize) {
              onPageSizeChange(next.pageSize);
            }
          }
          return next;
        });
      },
      manualPagination: serverSide,
      manualSorting: serverSide,
      manualFiltering: serverSide,
      pageCount: serverSide
        ? Math.ceil((serverTotalCount ?? 0) / (propPageSize || effectiveDefaultPageSize))
        : undefined,
      autoResetPageIndex: false,
    },
    (state) => state
  );

  // ─── Filter & Search Counts ─────────────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    return columnFilters.filter(
      (f: any) => Array.isArray(f.value) && (f.value as string[]).length > 0
    ).length;
  }, [columnFilters]);

  const clearAllFilters = () => {
    setColumnFilters([]);
    setGlobalSearch('');
    setDebouncedSearch('');
    table.setPageIndex(0);
    if (onFilterChange) onFilterChange({});
  };

  // Distinct values for currently active filter popover
  const distinctList = useMemo(() => {
    if (!activeFilterColId) return [] as Array<{ value: string; count: number }>;
    const col = table.getColumn(activeFilterColId);
    if (!col) return [] as Array<{ value: string; count: number }>;

    const countMap = new Map<string, number>();
    const allRows = table.getCoreRowModel().rows;
    for (let i = 0; i < allRows.length; i++) {
      const val = allRows[i].getValue(activeFilterColId);
      const strVal = val === null || val === undefined || val === '' ? '(Blank)' : String(val);
      countMap.set(strVal, (countMap.get(strVal) || 0) + 1);
    }

    const list = Array.from(countMap.entries()).map(([value, count]) => ({
      value,
      count,
    }));
    list.sort((a, b) => a.value.localeCompare(b.value));
    return list;
  }, [activeFilterColId, table, data]);

  // ─── Pagination Calculations ────────────────────────────────────────────────
  const activePageIndex = (table.state?.pagination?.pageIndex ?? 0) + 1;
  const activePageSize = table.state?.pagination?.pageSize ?? effectiveDefaultPageSize;
  const totalItems = serverSide ? (serverTotalCount ?? 0) : table.getFilteredRowModel().rows.length;
  const totalPages = Math.max(1, table.getPageCount());

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

  // ─── CSV Export (Blob-based) ────────────────────────────────────────────────
  const exportToCSV = () => {
    const exportColumns = columns.filter((c) => c.id !== 'actions' && c.id !== 'action');
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const chunks: string[] = [
      exportColumns.map((c) => escape(typeof c.header === 'string' ? c.header : c.id)).join(','),
    ];

    const rowsToExport = table.getFilteredRowModel().rows;
    for (let i = 0; i < rowsToExport.length; i++) {
      const r = rowsToExport[i];
      let line = '';
      for (let j = 0; j < exportColumns.length; j++) {
        const col = exportColumns[j];
        let val = '';
        if (col.exportValue) {
          val = col.exportValue(r.original);
        } else {
          const raw = r.getValue(col.id);
          val = raw === null || raw === undefined ? '' : String(raw);
        }
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
                  table.setPageIndex(0);
                }}
                className="pl-9 h-9 text-xs bg-background/80"
              />
              {globalSearch && (
                <button
                  onClick={() => {
                    setGlobalSearch('');
                    setDebouncedSearch('');
                  }}
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

          {/* Column Visibility Selector */}
          {enableColumnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 rounded-xl border-border/80 bg-background/80 hover:bg-background text-foreground text-xs font-semibold gap-2 transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                  title="Toggle column visibility"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllLeafColumns()
                  .filter((col) => col.getCanHide())
                  .map((col) => {
                    const colMeta: any = col.columnDef.meta;
                    const label = colMeta?.originalHeader || col.id;
                    return (
                      <DropdownMenuCheckboxItem
                        key={col.id}
                        className="capitalize text-xs cursor-pointer"
                        checked={col.getIsVisible()}
                        onCheckedChange={(value) => col.toggleVisibility(!!value)}
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Export to CSV */}
          {enableExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={table.getFilteredRowModel().rows.length === 0}
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
          {columnFilters.map((cf: any) => {
            const col = table.getColumn(cf.id);
            const colMeta: any = col?.columnDef.meta;
            const headerName = colMeta?.originalHeader || cf.id;
            const vals = (cf.value as string[]) || [];
            if (vals.length === 0) return null;
            return (
              <span
                key={cf.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium"
              >
                <span className="font-semibold text-foreground">{headerName}:</span>
                <span className="truncate max-w-[150px]">{vals.join(', ')}</span>
                <button
                  type="button"
                  onClick={() => col?.setFilterValue(undefined)}
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
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const colMeta: any = header.column.columnDef.meta;
                  const align = colMeta?.align;
                  const width = colMeta?.width;
                  const filterable = colMeta?.filterable;
                  const isFiltered =
                    ((header.column.getFilterValue() as string[] | undefined)?.length ?? 0) > 0;
                  const isSorted = header.column.getIsSorted();
                  const sortable = header.column.getCanSort();
                  const headerTitle = colMeta?.originalHeader || header.id;

                  return (
                    <th
                      key={header.id}
                      style={{ width }}
                      className={`py-3.5 px-4 transition-colors relative group/th ${
                        align === 'center'
                          ? 'text-center'
                          : align === 'right'
                            ? 'text-right'
                            : 'text-left'
                      }`}
                    >
                      <div
                        className={`inline-flex items-center gap-1.5 ${
                          align === 'center'
                            ? 'justify-center'
                            : align === 'right'
                              ? 'justify-end'
                              : 'justify-start'
                        }`}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="font-bold hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors group"
                          >
                            <span className={isSorted ? 'text-foreground font-bold' : ''}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {isSorted ? (
                              isSorted === 'desc' ? (
                                <ArrowDown className="w-3 h-3 text-primary stroke-[2.5]" />
                              ) : (
                                <ArrowUp className="w-3 h-3 text-primary stroke-[2.5]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 text-muted-foreground transition-opacity" />
                            )}
                          </button>
                        ) : (
                          <span className="font-bold">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}

                        {filterable && (
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeFilterColId === header.column.id) {
                                  setActiveFilterColId(null);
                                  setFilterSearch('');
                                } else {
                                  setActiveFilterColId(header.column.id);
                                  setFilterSearch('');
                                }
                              }}
                              className={`p-1 rounded-md transition-all cursor-pointer ${
                                isFiltered
                                  ? 'bg-primary/20 text-primary border border-primary/30 shadow-2xs'
                                  : 'text-muted-foreground/40 hover:text-foreground hover:bg-muted opacity-60 group-hover/th:opacity-100'
                              }`}
                              title={`Filter by ${headerTitle}`}
                            >
                              <Filter className="w-3 h-3" />
                            </button>

                            {/* Filter Popover */}
                            {activeFilterColId === header.column.id && (
                              <div
                                ref={filterPopoverRef}
                                className="absolute left-0 mt-2 w-64 rounded-xl border border-border bg-popover/95 backdrop-blur-xl p-3 shadow-2xl z-50 normal-case text-foreground text-xs space-y-2.5 animate-in fade-in-50 zoom-in-95"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between border-b border-border/80 pb-2">
                                  <span className="font-bold text-xs flex items-center gap-1.5">
                                    <Filter className="w-3.5 h-3.5 text-primary" /> Filter{' '}
                                    {headerTitle}
                                  </span>
                                  {isFiltered && (
                                    <button
                                      onClick={() => header.column.setFilterValue(undefined)}
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
                                        ((header.column.getFilterValue() as string[] | undefined)
                                          ?.length || 0) === distinctList.length &&
                                        distinctList.length > 0
                                      }
                                      onChange={() => {
                                        const current =
                                          (header.column.getFilterValue() as
                                            string[] | undefined) || [];
                                        if (current.length === distinctList.length) {
                                          header.column.setFilterValue(undefined);
                                        } else {
                                          header.column.setFilterValue(
                                            distinctList.map((d) => d.value)
                                          );
                                        }
                                      }}
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
                                      const currentSelected =
                                        (header.column.getFilterValue() as string[] | undefined) ||
                                        [];
                                      const checked = currentSelected.includes(item.value);
                                      return (
                                        <label
                                          key={item.value}
                                          className="flex items-center justify-between p-1 rounded-md hover:bg-muted/50 cursor-pointer text-xs select-none transition-colors"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => {
                                                if (checked) {
                                                  const next = currentSelected.filter(
                                                    (v) => v !== item.value
                                                  );
                                                  header.column.setFilterValue(
                                                    next.length > 0 ? next : undefined
                                                  );
                                                } else {
                                                  header.column.setFilterValue([
                                                    ...currentSelected,
                                                    item.value,
                                                  ]);
                                                }
                                              }}
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
            ))}
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
            ) : table.getRowModel().rows.length === 0 ? (
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
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick && onRowClick(row.original)}
                  className={`hover:bg-muted/30 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colMeta: any = cell.column.columnDef.meta;
                    const align = colMeta?.align;
                    return (
                      <td
                        key={cell.id}
                        className={`py-3 px-4 ${
                          align === 'center'
                            ? 'text-center'
                            : align === 'right'
                              ? 'text-right'
                              : 'text-left'
                        }`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
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
              onValueChange={(v) => {
                table.setPageSize(Number(v));
              }}
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
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
            title="First page"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </Button>

          {/* Previous page */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
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
                onClick={() => table.setPageIndex((p as number) - 1)}
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
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            title="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>

          {/* Last page */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(totalPages - 1)}
            title="Last page"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
