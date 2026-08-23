import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { orgService } from '../../lib/orgService';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';

export const Branding = () => {
  const { user } = useAuthStore();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366f1');

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => orgService.getOrg(orgId!),
    enabled: !!orgId,
  });

  useEffect(() => {
    if (org) {
      setName(org.name || '');
      setLogoUrl(org.logoUrl || '');
      setPrimaryColor(org.primaryColor || '#6366f1');
    }
  }, [org]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; logoUrl: string | null; primaryColor: string | null }) => 
      orgService.updateOrg(orgId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', orgId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      name,
      logoUrl: logoUrl || null,
      primaryColor: primaryColor || null,
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading branding settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Organization Branding</h1>
        <p className="text-muted-foreground mt-1">Customize how your organization looks to members across workspaces.</p>
      </div>

      <div className="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border bg-card text-card-foreground shadow-xs p-6">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization Name</Label>
            <Input
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Provide a URL for your company logo (square recommended).</p>
            {logoUrl && (
              <div className="mt-4 p-4 border rounded-lg bg-muted/40 inline-block">
                <img src={logoUrl} alt="Logo Preview" className="h-16 w-16 object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=Error'; }} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="primaryColor">Organization Brand Accent Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="primaryColor"
                type="color"
                className="w-12 h-10 p-1 rounded-md border border-input cursor-pointer bg-transparent"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
              />
              <Input
                type="text"
                className="flex-1 font-mono uppercase"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
              />
            </div>
            <p className="text-xs text-muted-foreground">This default primary color can be used for tenant-level white-labeling.</p>
          </div>

          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
          
          {updateMutation.isSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400 mt-2 font-medium">Settings saved successfully!</p>
          )}
          {updateMutation.isError && (
            <p className="text-sm text-destructive mt-2 font-medium">Failed to save settings.</p>
          )}
        </form>
      </div>
    </div>
  );
};
