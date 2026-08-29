import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { Button } from '@boardly/ui/button';
import { Label } from '@boardly/ui/label';
import { Input } from '@boardly/ui/input';
import { Sun, Moon, Laptop, Check, Sparkles, Palette, Eye, Sliders, RotateCcw } from 'lucide-react';
import { useThemeStore, THEME_PALETTES, ACCENT_PRESETS, type ThemeMode } from '../store/themeStore';

interface AppearanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AppearanceModal: React.FC<AppearanceModalProps> = ({ open, onOpenChange }) => {
  const {
    mode,
    palette,
    accentId,
    customAccentHex,
    setMode,
    setPalette,
    setAccentId,
    setCustomAccentHex,
  } = useThemeStore();

  const [hexInput, setHexInput] = useState(customAccentHex || '#6366f1');

  const modes: { id: ThemeMode; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Laptop },
  ];

  const handleReset = () => {
    setMode('system');
    setPalette('default');
    setAccentId('indigo');
    setCustomAccentHex(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] h-[88vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        {/* ─── Fixed Header ─── */}
        <DialogHeader className="p-5 sm:px-8 sm:py-5 border-b border-border/80 bg-card/90 backdrop-blur-md shrink-0 space-y-1">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Palette className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight">Theme & Appearance</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Defaults
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Personalize your workspace experience with custom themes, surface contrast, and accent
            colors.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Scrollable Body ─── */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8">
          {/* 1. Brightness / Mode Section */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Sun className="h-4 w-4 text-primary" /> Interface Mode
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {modes.map(({ id, label, icon: Icon }) => {
                const isActive = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium ${
                      isActive
                        ? 'border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary/20'
                        : 'border-border bg-card hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Curated Theme Palettes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Theme Palettes
              </Label>
              <span className="text-xs text-muted-foreground">
                6 handcrafted dark & contrast styles
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {THEME_PALETTES.map((preset) => {
                const isSelected = palette === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPalette(preset.id)}
                    className={`flex flex-col text-left p-3.5 rounded-xl border-2 transition-all relative overflow-hidden group ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                        : 'border-border bg-card hover:border-muted-foreground/30 hover:shadow-xs'
                    }`}
                  >
                    {/* Mini Visual Palette Preview */}
                    <div
                      className="w-full h-16 rounded-lg p-2 flex flex-col justify-between mb-3 border shadow-xs"
                      style={{
                        backgroundColor: preset.previewBg,
                        borderColor: `${preset.previewAccent}40`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="h-2 w-8 rounded-full"
                          style={{ backgroundColor: preset.previewAccent }}
                        />
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: preset.previewAccent }}
                        />
                      </div>
                      <div
                        className="h-6 w-full rounded p-1 flex items-center justify-between"
                        style={{ backgroundColor: preset.previewCard }}
                      >
                        <div className="h-1.5 w-12 bg-white/40 rounded-full" />
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: preset.previewAccent }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">{preset.name}</span>
                      {isSelected && (
                        <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Primary Accent Colors */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" /> Primary Accent Color
              </Label>
              {customAccentHex && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  Custom: {customAccentHex}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {ACCENT_PRESETS.map((accent) => {
                const isSelected = !customAccentHex && accentId === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    onClick={() => setAccentId(accent.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0 shadow-xs flex items-center justify-center text-white"
                      style={{ backgroundColor: accent.primary }}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span className="text-xs truncate">{accent.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Color Input */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center gap-2 border rounded-lg p-1.5 bg-card flex-1 max-w-xs">
                <input
                  type="color"
                  value={hexInput}
                  onChange={(e) => {
                    setHexInput(e.target.value);
                    setCustomAccentHex(e.target.value);
                  }}
                  className="w-8 h-8 rounded border-0 cursor-pointer p-0 bg-transparent"
                />
                <Input
                  type="text"
                  placeholder="#6366f1"
                  value={hexInput}
                  onChange={(e) => {
                    setHexInput(e.target.value);
                    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(e.target.value)) {
                      setCustomAccentHex(e.target.value);
                    }
                  }}
                  className="h-8 border-0 shadow-none font-mono uppercase text-xs focus-visible:ring-0"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                Pick any custom HEX branding color
              </span>
            </div>
          </div>

          {/* 4. Live Interactive UI Preview */}
          <div className="space-y-3 pt-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> Live Theme Preview
            </Label>
            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-xs">
                    B
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Sprint Planning Board</div>
                    <div className="text-xs text-muted-foreground">
                      Workspace: Product Engineering
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary font-medium">
                    Active Sprint
                  </span>
                  <Button size="sm" className="h-8 text-xs">
                    Create Task
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border bg-muted/40 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">To Do</div>
                  <div className="p-2.5 rounded-md bg-card border shadow-xs space-y-1.5">
                    <div className="text-xs font-medium">Implement SSO SCIM API</div>
                    <div className="text-[10px] text-muted-foreground">Updated 2h ago</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-muted/40 space-y-2">
                  <div className="text-xs font-semibold text-primary uppercase">In Progress</div>
                  <div className="p-2.5 rounded-md bg-card border border-primary/40 shadow-xs space-y-1.5">
                    <div className="text-xs font-medium">Multi-theme engine</div>
                    <div className="text-[10px] text-muted-foreground">Assigned to Dev</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-muted/40 space-y-2">
                  <div className="text-xs font-semibold text-green-500 uppercase">Done</div>
                  <div className="p-2.5 rounded-md bg-card border shadow-xs space-y-1.5">
                    <div className="text-xs font-medium">Marketplace Apps Catalog</div>
                    <div className="text-[10px] text-muted-foreground">Verified</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Fixed Bottom Action Footer ─── */}
        <div className="p-4 sm:px-8 border-t border-border/80 bg-card/90 backdrop-blur-md shrink-0 flex items-center justify-between">
          <div className="text-xs text-muted-foreground hidden sm:block">
            Changes are saved automatically to your workspace.
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Close
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              size="sm"
              className="px-6 cursor-pointer"
            >
              Save &amp; Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
