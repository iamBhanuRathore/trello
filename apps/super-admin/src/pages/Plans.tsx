import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superAdminService, type PlatformPlan } from '../lib/superAdminService';
import { Button } from '@boardly/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Layers, Sparkles, Sliders, HardDrive, Users, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { AdminQueryError } from '../components/AdminQueryError';

export const Plans: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<PlatformPlan | null>(null);
  const [maxWorkspaces, setMaxWorkspaces] = useState<number | ''>('');
  const [maxBoards, setMaxBoards] = useState<number | ''>('');
  const [maxSeats, setMaxSeats] = useState<number | ''>('');
  const [maxStorageGb, setMaxStorageGb] = useState<number | ''>('');

  const {
    data: plans = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['superAdminPlans'], queryFn: superAdminService.getPlans });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => superAdminService.updatePlan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminPlans'] });
      setEditingPlan(null);
      toast.success('Plan tier limits updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update plan limits');
    },
  });

  const handleOpenEdit = (plan: PlatformPlan) => {
    setEditingPlan(plan);
    setMaxWorkspaces(plan.maxWorkspaces ?? '');
    setMaxBoards(plan.maxBoards ?? '');
    setMaxSeats(plan.maxSeats ?? '');
    setMaxStorageGb(plan.maxStorageGb ?? '');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    updateMutation.mutate({
      id: editingPlan.id,
      data: {
        maxWorkspaces: maxWorkspaces === '' ? null : Number(maxWorkspaces),
        maxBoards: maxBoards === '' ? null : Number(maxBoards),
        maxSeats: maxSeats === '' ? null : Number(maxSeats),
        maxStorageGb: maxStorageGb === '' ? null : Number(maxStorageGb),
      },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <span>Subscription Plans & Tier Enforcement</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
            Billing Policies
          </span>
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Configure resource limits, feature flags, storage allocations, and seat caps across
          subscription tiers.
        </p>
      </div>

      {/* Plans Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isError ? (
          <AdminQueryError
            className="col-span-4"
            message="Couldn't load plan configurations."
            onRetry={() => void refetch()}
          />
        ) : isLoading ? (
          <div className="col-span-4 p-12 text-center text-xs text-muted-foreground">
            Loading plan configurations...
          </div>
        ) : (
          plans.map((plan) => {
            const isEnterprise = plan.tier === 'enterprise';

            return (
              <div
                key={plan.id}
                className={`p-6 rounded-2xl border flex flex-col justify-between transition-all ${
                  isEnterprise
                    ? 'border-purple-500/40 bg-gradient-to-b from-purple-950/20 via-card to-card shadow-lg shadow-purple-500/5'
                    : 'border-border/80 bg-card/60'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 uppercase">
                      {plan.tier}
                    </div>
                    {isEnterprise && <Sparkles className="w-4 h-4 text-purple-400" />}
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {isEnterprise
                        ? 'Unlimited enterprise scalability with SLA'
                        : `Standard tier with tailored resource constraints`}
                    </p>
                  </div>

                  {/* Limits List */}
                  <div className="space-y-2 pt-2 border-t border-border/60 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-400" /> Max Seats:
                      </span>
                      <span className="font-bold text-white">
                        {plan.maxSeats ? plan.maxSeats : 'Unlimited'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-400" /> Workspaces:
                      </span>
                      <span className="font-bold text-white">
                        {plan.maxWorkspaces ? plan.maxWorkspaces : 'Unlimited'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5 text-purple-400" /> Boards / Projects:
                      </span>
                      <span className="font-bold text-white">
                        {plan.maxBoards ? plan.maxBoards : 'Unlimited'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-purple-400" /> Storage Limit:
                      </span>
                      <span className="font-bold text-white">
                        {plan.maxStorageGb ? `${plan.maxStorageGb} GB` : 'Unlimited'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-1.5 cursor-pointer hover:border-purple-500 hover:text-purple-300"
                    onClick={() => handleOpenEdit(plan)}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Adjust Limits</span>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Limits Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="sm:max-w-md p-5 bg-card border border-border/80 rounded-2xl shadow-2xl">
          {editingPlan && (
            <form onSubmit={handleSave} className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2 text-purple-400">
                  <Sliders className="w-5 h-5" />
                  <DialogTitle className="text-base font-bold text-white">
                    Adjust Tier Limits: {editingPlan.name}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Leave fields blank for unlimited allocations.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Max Team Seats</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={maxSeats}
                    onChange={(e) =>
                      setMaxSeats(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="text-xs bg-background text-white border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Max Workspaces</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={maxWorkspaces}
                    onChange={(e) =>
                      setMaxWorkspaces(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="text-xs bg-background text-white border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Max Boards</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={maxBoards}
                    onChange={(e) =>
                      setMaxBoards(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="text-xs bg-background text-white border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Max Storage (GB)</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={maxStorageGb}
                    onChange={(e) =>
                      setMaxStorageGb(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="text-xs bg-background text-white border-border"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setEditingPlan(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Save Tier Limits
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
