import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superAdminService } from '../../lib/superAdminService';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';

export const Plans = () => {
  const queryClient = useQueryClient();
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  
  // Edit state
  const [maxWorkspaces, setMaxWorkspaces] = useState<number>(1);
  const [maxBoards, setMaxBoards] = useState<number | ''>('');
  const [maxStorageGb, setMaxStorageGb] = useState<number>(1);
  const [maxSeats, setMaxSeats] = useState<number>(5);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['superAdminPlans'],
    queryFn: superAdminService.getPlans,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string, maxWorkspaces: number, maxBoards: number | null, maxStorageGb: number, maxSeats: number }) => 
      superAdminService.updatePlan(data.id, {
        maxWorkspaces: data.maxWorkspaces,
        maxBoards: data.maxBoards,
        maxStorageGb: data.maxStorageGb,
        maxSeats: data.maxSeats,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminPlans'] });
      setEditingPlanId(null);
    },
  });

  const handleEditClick = (plan: any) => {
    setEditingPlanId(plan.id);
    setMaxWorkspaces(plan.maxWorkspaces || 1);
    setMaxBoards(plan.maxBoards === null ? '' : plan.maxBoards);
    setMaxStorageGb(plan.maxStorageGb || 1);
    setMaxSeats(plan.maxSeats || 5);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId) return;

    updateMutation.mutate({
      id: editingPlanId,
      maxWorkspaces: Number(maxWorkspaces),
      maxBoards: maxBoards === '' ? null : Number(maxBoards),
      maxStorageGb: Number(maxStorageGb),
      maxSeats: Number(maxSeats),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plans & Limits</h1>
        <p className="text-muted-foreground mt-1">Manage platform subscription plans and resource limits.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading plans...</div>
        ) : (
          plans?.map((plan: any) => (
            <div key={plan.id} className="border rounded-xl bg-card shadow-sm p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-xl">{plan.name} <span className="text-sm font-normal text-muted-foreground ml-2 capitalize">({plan.tier})</span></h3>
                </div>
                {editingPlanId !== plan.id && (
                  <Button variant="outline" size="sm" onClick={() => handleEditClick(plan)}>Edit Limits</Button>
                )}
              </div>

              {editingPlanId === plan.id ? (
                <form onSubmit={handleSave} className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max Seats</Label>
                      <Input type="number" min="1" value={maxSeats} onChange={e => setMaxSeats(Number(e.target.value))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Workspaces</Label>
                      <Input type="number" min="1" value={maxWorkspaces} onChange={e => setMaxWorkspaces(Number(e.target.value))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Boards (Leave blank for unlimited)</Label>
                      <Input type="number" min="1" value={maxBoards} onChange={e => setMaxBoards(e.target.value === '' ? '' : Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Storage (GB)</Label>
                      <Input type="number" min="1" value={maxStorageGb} onChange={e => setMaxStorageGb(Number(e.target.value))} required />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end mt-4">
                    <Button type="button" variant="ghost" onClick={() => setEditingPlanId(null)}>Cancel</Button>
                    <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</Button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 pt-4 border-t text-sm">
                  <div>
                    <div className="text-muted-foreground mb-1">Max Seats</div>
                    <div className="font-medium">{plan.maxSeats || 5}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Max Workspaces</div>
                    <div className="font-medium">{plan.maxWorkspaces || 1}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Max Boards</div>
                    <div className="font-medium">{plan.maxBoards === null ? 'Unlimited' : plan.maxBoards}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Max Storage</div>
                    <div className="font-medium">{plan.maxStorageGb || 1} GB</div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
