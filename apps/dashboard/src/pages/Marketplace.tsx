import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMarketplaceApps,
  installMarketplaceApp,
  updateInstalledAppConfig,
  uninstallMarketplaceApp,
} from '../lib/api';
import {
  Store,
  Search,
  CheckCircle2,
  Settings,
  Trash2,
  ExternalLink,
  Code2,
  MessageSquare,
  Sparkles,
  BarChart,
  GitPullRequest,
  Check,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';

const CATEGORIES = [
  { id: 'all', label: 'All Apps' },
  { id: 'developer', label: 'Developer Tools' },
  { id: 'communication', label: 'Communication' },
  { id: 'analytics', label: 'Analytics & Time' },
  { id: 'automation', label: 'Automation' },
  { id: 'utility', label: 'Utilities' },
];

export function Marketplace() {
  const queryClient = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [configuringApp, setConfiguringApp] = useState<any>(null);
  const [appConfig, setAppConfig] = useState<Record<string, any>>({});

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['marketplaceApps', selectedCategory, searchQuery],
    queryFn: () => getMarketplaceApps(selectedCategory, searchQuery),
  });

  const installMutation = useMutation({
    mutationFn: (appId: string) => installMarketplaceApp(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplaceApps'] });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ installedId, config }: { installedId: string; config: any }) =>
      updateInstalledAppConfig(installedId, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplaceApps'] });
      setConfiguringApp(null);
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: (installedId: string) => uninstallMarketplaceApp(installedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplaceApps'] });
      setConfiguringApp(null);
    },
  });

  const openConfigDrawer = (app: any) => {
    setConfiguringApp(app);
    setAppConfig(app.installedApp?.config || {});
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuringApp?.installedApp?.id) return;

    updateConfigMutation.mutate({
      installedId: configuringApp.installedApp.id,
      config: appConfig,
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'developer':
        return <Code2 className="w-5 h-5 text-purple-500" />;
      case 'communication':
        return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case 'analytics':
        return <BarChart className="w-5 h-5 text-emerald-500" />;
      case 'automation':
        return <GitPullRequest className="w-5 h-5 text-amber-500" />;
      default:
        return <Sparkles className="w-5 h-5 text-indigo-500" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Boardly App Marketplace &amp; Power-Ups</h1>
            <p className="text-sm text-muted-foreground">
              Supercharge your workflows with verified integrations, custom fields, and real-time syncing tools.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search power-ups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* App Grid */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Loading power-ups catalog...</p>
          </div>
        </div>
      ) : apps.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {apps.map((app: any) => (
            <div
              key={app.id}
              className="p-5 rounded-2xl border bg-card/80 shadow-xs space-y-4 hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-muted/60 border border-muted-foreground/10 flex items-center justify-center">
                      {getCategoryIcon(app.category)}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        {app.name}
                        {app.isVerified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500/20" />
                        )}
                      </h3>
                      <p className="text-[11px] text-muted-foreground">by {app.developerName}</p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize ${
                      app.isInstalled
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {app.isInstalled ? 'Installed' : app.category}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {app.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t">
                {app.isInstalled ? (
                  <div className="flex items-center gap-2 w-full justify-between">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => openConfigDrawer(app)}
                    >
                      <Settings className="w-3.5 h-3.5" /> Configure
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      onClick={() => uninstallMutation.mutate(app.installedApp.id)}
                    >
                      Uninstall
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs font-semibold gap-1.5"
                    disabled={installMutation.isPending}
                    onClick={() => installMutation.mutate(app.id)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Install Power-Up
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center text-xs text-muted-foreground border rounded-2xl bg-muted/10 space-y-2">
          <Store className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="font-semibold text-foreground text-sm">No Power-Ups found</p>
          <p>Try searching for a different keyword or category.</p>
        </div>
      )}

      {/* APP CONFIGURATION MODAL */}
      <Dialog open={!!configuringApp} onOpenChange={(open) => !open && setConfiguringApp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> {configuringApp?.name} Settings
            </DialogTitle>
            <DialogDescription>
              Configure preferences and credentials for this power-up integration.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
            {configuringApp?.configSchema && configuringApp.configSchema.length > 0 ? (
              configuringApp.configSchema.map((field: any) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </Label>
                  {field.type === 'boolean' ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        checked={appConfig[field.key] ?? field.default ?? false}
                        onChange={(e) =>
                          setAppConfig((prev) => ({ ...prev, [field.key]: e.target.checked }))
                        }
                        className="rounded border-slate-700 text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="text-xs text-muted-foreground">Enabled</span>
                    </div>
                  ) : (
                    <Input
                      type={field.type || 'text'}
                      value={appConfig[field.key] ?? ''}
                      onChange={(e) =>
                        setAppConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      required={field.required}
                      className="text-xs h-9"
                    />
                  )}
                </div>
              ))
            ) : (
              <div className="p-4 rounded-xl bg-muted/20 border text-xs text-muted-foreground text-center">
                This power-up is operational and does not require additional configuration parameters.
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 text-xs gap-1"
                onClick={() => {
                  if (configuringApp?.installedApp?.id) {
                    uninstallMutation.mutate(configuringApp.installedApp.id);
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove Power-Up
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfiguringApp(null)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs gap-1">
                  <Check className="w-3.5 h-3.5" /> Save Changes
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
