import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X, User as UserIcon, Columns } from 'lucide-react';
import { cn } from '../utils';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  avatarUrl?: string;
  initials?: string;
  avatarColor?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  keywords?: string[];
  disabled?: boolean;
}

export interface SearchableSelectProps {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  size?: 'sm' | 'default';
  align?: 'left' | 'right';
  renderOption?: (option: SelectOption, isSelected: boolean) => React.ReactNode;
  renderTrigger?: (selectedOption?: SelectOption) => React.ReactNode;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  emptyText = 'No matching options found',
  clearable = false,
  disabled = false,
  className,
  triggerClassName,
  popoverClassName,
  size = 'default',
  align = 'left',
  renderOption,
  renderTrigger,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number; placeAbove: boolean }>({
    left: 0,
    top: 0,
    width: 240,
    placeAbove: false,
  });

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return options;
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(query);
      const matchSub = opt.sublabel ? opt.sublabel.toLowerCase().includes(query) : false;
      const matchKeywords = opt.keywords ? opt.keywords.some((k) => k.toLowerCase().includes(query)) : false;
      return matchLabel || matchSub || matchKeywords;
    });
  }, [options, searchQuery]);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const popoverHeight = 280;
    const popoverWidth = Math.max(rect.width, 240);

    const spaceBelow = viewportHeight - rect.bottom;
    const placeAbove = spaceBelow < popoverHeight && rect.top > popoverHeight;

    let left = rect.left;
    if (align === 'right') {
      left = rect.right - popoverWidth;
    }

    // Viewport clamping
    left = Math.max(12, Math.min(left, viewportWidth - popoverWidth - 12));
    const top = placeAbove
      ? Math.max(12, rect.top - popoverHeight - 6)
      : Math.min(viewportHeight - popoverHeight - 12, rect.bottom + 6);

    setCoords({
      left,
      top,
      width: popoverWidth,
      placeAbove,
    });
  }, [align]);

  const handleOpen = () => {
    if (disabled) return;
    updateCoords();
    setIsOpen(true);
    setSearchQuery('');
    setHighlightedIndex(0);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  useEffect(() => {
    if (!isOpen) return;

    updateCoords();
    const handleScroll = (e: Event) => {
      // Don't close if scrolling inside the dropdown popover itself
      if (listRef.current && listRef.current.contains(e.target as Node)) return;
      handleClose();
    };

    const handleResize = () => updateCoords();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
      } else if (e.key === 'Enter') {
        if (filteredOptions[highlightedIndex]) {
          e.preventDefault();
          handleSelect(filteredOptions[highlightedIndex].value);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    // Auto-focus search input
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, filteredOptions, highlightedIndex, updateCoords]);

  const handleSelect = (val: string) => {
    onChange(val);
    handleClose();
    triggerRef.current?.focus();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    triggerRef.current?.focus();
  };

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={isOpen ? handleClose : handleOpen}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-lg border border-input bg-background font-medium text-foreground transition-all duration-150 outline-none text-left cursor-pointer',
          'focus:ring-1 focus:ring-primary focus:border-primary',
          'hover:bg-muted/30 hover:border-border',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          size === 'sm' ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-xs',
          triggerClassName
        )}
      >
        {renderTrigger ? (
          renderTrigger(selectedOption)
        ) : (
          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
            {selectedOption?.avatarUrl ? (
              <img
                src={selectedOption.avatarUrl}
                alt={selectedOption.label}
                className="w-4 h-4 rounded-full object-cover shrink-0 ring-1 ring-border"
              />
            ) : selectedOption?.initials ? (
              <div
                className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 text-white',
                  selectedOption.avatarColor || 'bg-primary'
                )}
              >
                {selectedOption.initials}
              </div>
            ) : selectedOption?.icon ? (
              <span className="shrink-0 text-muted-foreground">{selectedOption.icon}</span>
            ) : null}

            <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>

            {selectedOption?.badge && <span className="shrink-0">{selectedOption.badge}</span>}
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
          {clearable && selectedOption && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 hover:text-foreground rounded transition-colors"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-150', isOpen && 'rotate-180')} />
        </div>
      </button>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999]">
            {/* Click outside backdrop */}
            <div className="fixed inset-0" onClick={handleClose} />

            <div
              ref={listRef}
              style={{
                position: 'fixed',
                left: `${coords.left}px`,
                top: `${coords.top}px`,
                width: `${coords.width}px`,
              }}
              className={cn(
                'z-[100000] max-h-[290px] flex flex-col rounded-xl bg-popover/95 backdrop-blur-2xl border border-border/80 shadow-2xl ring-1 ring-primary/20 animate-in fade-in-0 zoom-in-95 duration-100 overflow-hidden text-foreground',
                popoverClassName
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Bar Header */}
              <div className="p-2 border-b border-border/60 flex items-center gap-2 bg-muted/30">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Options List */}
              <div className="flex-1 overflow-y-auto p-1 space-y-0.5 max-h-[220px]">
                {filteredOptions.length === 0 ? (
                  <div className="py-6 px-3 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5">
                    <Search className="w-4 h-4 opacity-40" />
                    <span>{emptyText}</span>
                  </div>
                ) : (
                  filteredOptions.map((opt, idx) => {
                    const isSelected = opt.value === value;
                    const isHighlighted = idx === highlightedIndex;

                    return (
                      <div
                        key={opt.value}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => !opt.disabled && handleSelect(opt.value)}
                        className={cn(
                          'w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs font-medium cursor-pointer transition-colors',
                          opt.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
                          isSelected ? 'bg-primary/15 text-primary font-semibold' : 'text-foreground',
                          isHighlighted && !isSelected && 'bg-muted/70 text-foreground'
                        )}
                      >
                        {renderOption ? (
                          renderOption(opt, isSelected)
                        ) : (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {opt.avatarUrl ? (
                              <img
                                src={opt.avatarUrl}
                                alt={opt.label}
                                className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-border"
                              />
                            ) : opt.initials ? (
                              <div
                                className={cn(
                                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white',
                                  opt.avatarColor || 'bg-primary'
                                )}
                              >
                                {opt.initials}
                              </div>
                            ) : opt.icon ? (
                              <span className="shrink-0 text-muted-foreground">{opt.icon}</span>
                            ) : null}

                            <div className="min-w-0 flex-1">
                              <div className="truncate">{opt.label}</div>
                              {opt.sublabel && (
                                <div className="text-[10px] text-muted-foreground truncate">{opt.sublabel}</div>
                              )}
                            </div>

                            {opt.badge && <span className="shrink-0">{opt.badge}</span>}
                          </div>
                        )}

                        {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-1" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// Deterministic gradient generator for user initials
const AVATAR_BG_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-purple-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-indigo-600',
  'bg-teal-600',
  'bg-pink-600',
  'bg-cyan-600',
  'bg-violet-600',
];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_BG_COLORS[Math.abs(hash) % AVATAR_BG_COLORS.length];
}

function getInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.substring(0, 2).toUpperCase();
  }
  return 'U';
}

/**
 * High-Level Specialized Member / User Searchable Select
 */
export function MemberSearchableSelect({
  members = [],
  currentUser,
  value,
  onChange,
  allowUnassigned = true,
  unassignedLabel = 'Unassigned',
  placeholder = 'Assign member...',
  size = 'default',
  className,
  triggerClassName,
}: {
  members: any[];
  currentUser?: any;
  value?: string;
  onChange: (userId: string) => void;
  allowUnassigned?: boolean;
  unassignedLabel?: string;
  placeholder?: string;
  size?: 'sm' | 'default';
  className?: string;
  triggerClassName?: string;
}) {
  const options: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = [];

    if (allowUnassigned) {
      list.push({
        value: '',
        label: unassignedLabel,
        icon: <UserIcon className="w-3.5 h-3.5 opacity-50" />,
        keywords: ['unassigned', 'none', 'clear', 'nobody'],
      });
    }

    if (currentUser?.id) {
      list.push({
        value: currentUser.id,
        label: `Assign to Me (${currentUser.name || currentUser.email})`,
        sublabel: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
        initials: getInitials(currentUser.name, currentUser.email),
        avatarColor: getAvatarColor(currentUser.id),
        badge: (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30">
            You
          </span>
        ),
        keywords: ['me', currentUser.name || '', currentUser.email || ''],
      });
    }

    members.forEach((m: any) => {
      const userId = m.userId || m.id;
      if (!userId || userId === currentUser?.id) return;

      list.push({
        value: userId,
        label: m.name || m.email || 'Team Member',
        sublabel: m.email !== m.name ? m.email : undefined,
        avatarUrl: m.avatarUrl || m.user?.avatarUrl,
        initials: getInitials(m.name || m.user?.name, m.email || m.user?.email),
        avatarColor: getAvatarColor(userId),
        badge: m.role ? (
          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-muted text-muted-foreground border border-border">
            {m.role}
          </span>
        ) : undefined,
        keywords: [m.name || '', m.email || '', m.role || ''],
      });
    });

    return list;
  }, [members, currentUser, allowUnassigned, unassignedLabel]);

  return (
    <SearchableSelect
      options={options}
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search by name, email, or role..."
      size={size}
      className={className}
      triggerClassName={triggerClassName}
    />
  );
}

/**
 * High-Level Specialized Board Column / List Searchable Select
 */
export function ListSearchableSelect({
  lists = [],
  value,
  onChange,
  placeholder = 'Select column...',
  size = 'default',
  className,
  triggerClassName,
}: {
  lists: Array<{ id: string; name: string; cards?: any[] }>;
  value?: string;
  onChange: (listId: string) => void;
  placeholder?: string;
  size?: 'sm' | 'default';
  className?: string;
  triggerClassName?: string;
}) {
  const options: SelectOption[] = useMemo(() => {
    return lists.map((l) => ({
      value: l.id,
      label: l.name,
      icon: <Columns className="w-3.5 h-3.5 text-primary" />,
      badge: l.cards ? (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-muted text-muted-foreground">
          {l.cards.length} cards
        </span>
      ) : undefined,
      keywords: [l.name],
    }));
  }, [lists]);

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search columns..."
      size={size}
      className={className}
      triggerClassName={triggerClassName}
    />
  );
}
