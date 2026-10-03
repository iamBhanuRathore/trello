import React, { Suspense, lazy, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@boardly/ui/dropdown-menu';
import { cn } from '@boardly/ui/utils';
import { Sun, Moon, Laptop, Palette, Check, Sparkles } from 'lucide-react';
import { useThemeStore, THEME_PALETTES } from '../store/themeStore';
// Code-split: the appearance studio loads only when the user opens it.
const AppearanceModal = lazy(() =>
  import('./AppearanceModal').then((m) => ({ default: m.AppearanceModal }))
);

interface ThemeToggleProps {
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = false }) => {
  const mode = useThemeStore((s) => s.mode);
  const palette = useThemeStore((s) => s.palette);
  const resolvedIsDark = useThemeStore((s) => s.resolvedIsDark);
  const setMode = useThemeStore((s) => s.setMode);
  const setPalette = useThemeStore((s) => s.setPalette);
  const [modalOpen, setModalOpen] = useState(false);

  const getModeIcon = () => {
    if (mode === 'system') return Laptop;
    return resolvedIsDark ? Moon : Sun;
  };

  const Icon = getModeIcon();

  const currentPalette = THEME_PALETTES.find((p) => p.id === palette) || THEME_PALETTES[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted/80 hover:text-foreground h-9 w-9 relative cursor-pointer border border-transparent hover:border-border',
            className
          )}
          title={`Current theme: ${mode === 'system' ? 'System' : mode} (${currentPalette.name})`}
        >
          <Icon className="h-4 w-4 text-foreground" />
          {showLabel && (
            <span className="ml-2 text-xs font-medium capitalize">
              {mode === 'system' ? 'System' : mode}
            </span>
          )}
          {palette !== 'default' && (
            <span
              className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full border border-background shadow-xs"
              style={{ backgroundColor: currentPalette.previewAccent }}
            />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5 space-y-0.5 z-50">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1 flex items-center justify-between">
            <span>Theme Mode</span>
            {mode === 'system' && (
              <span className="text-[10px] font-normal uppercase tracking-wider text-primary">
                Auto
              </span>
            )}
          </DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => setMode('light')}
            className={`cursor-pointer flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md ${
              mode === 'light' ? 'bg-primary/10 font-semibold text-primary' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-500" />
              <span>Light Mode</span>
            </div>
            {mode === 'light' && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setMode('dark')}
            className={`cursor-pointer flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md ${
              mode === 'dark' ? 'bg-primary/10 font-semibold text-primary' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-indigo-400" />
              <span>Dark Mode</span>
            </div>
            {mode === 'dark' && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setMode('system')}
            className={`cursor-pointer flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md ${
              mode === 'system' ? 'bg-primary/10 font-semibold text-primary' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <Laptop className="h-4 w-4 text-blue-400" />
              <span>System Match</span>
            </div>
            {mode === 'system' && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Palettes
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {currentPalette.name}
            </span>
          </DropdownMenuLabel>

          <div className="grid grid-cols-2 gap-1 px-1 py-1">
            {THEME_PALETTES.map((p) => {
              const isSelected = palette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPalette(p.id)}
                  className={`flex items-center gap-1.5 p-1.5 rounded-md text-[11px] text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary/15 font-semibold text-primary'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.previewAccent }}
                  />
                  <span className="truncate">{p.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuItem
            onClick={() => setModalOpen(true)}
            className="cursor-pointer flex items-center gap-2 text-xs font-medium text-primary hover:bg-primary/10 px-2.5 py-2 rounded-md"
          >
            <Palette className="h-4 w-4" />
            <span>Customize Appearance...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {modalOpen && (
        <Suspense fallback={null}>
          <AppearanceModal open={modalOpen} onOpenChange={setModalOpen} />
        </Suspense>
      )}
    </>
  );
};
