import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@boardly/ui/card';
import { Button } from '@boardly/ui/button';
import {
  FaceAngry as Slack,
  GitBranchPlus as Github,
  HardDrive,
  Check,
  Loader2,
  Link as LinkIcon,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';

type IntegrationProvider = 'slack' | 'github' | 'google_drive';

interface Integration {
  id: string;
  provider: IntegrationProvider;
  isConnected: boolean;
  createdAt: string;
}

const PROVIDERS = [
  {
    id: 'slack' as IntegrationProvider,
    name: 'Slack',
    description: 'Send notifications to Slack channels when cards are moved or commented on.',
    icon: Slack,
    color: 'text-[#E01E5A]',
  },
  {
    id: 'github' as IntegrationProvider,
    name: 'GitHub',
    description: 'Link pull requests and commits to cards. Auto-move cards when PRs are merged.',
    icon: Github,
    color: 'text-gray-900 dark:text-gray-100',
  },
  {
    id: 'google_drive' as IntegrationProvider,
    name: 'Google Drive',
    description: 'Attach files and folders from Google Drive directly to cards.',
    icon: HardDrive, // closest to drive icon in lucide
    color: 'text-[#0F9D58]',
  },
];

export const Integrations: React.FC = () => {
  const queryClient = useQueryClient();
  const [connectingId, setConnectingId] = useState<IntegrationProvider | null>(null);

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await api.get<Integration[]>('/integrations');
      return res.data;
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (provider: IntegrationProvider) => {
      // simulate OAuth delay
      await new Promise((r) => setTimeout(r, 1500));
      const res = await api.post('/integrations/connect', { provider });
      return res.data;
    },
    onMutate: (provider) => {
      setConnectingId(provider);
    },
    onSuccess: () => {
      toast.success('Integration connected successfully');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: () => {
      toast.error('Failed to connect integration');
    },
    onSettled: () => {
      setConnectingId(null);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/integrations/${id}`);
    },
    onSuccess: () => {
      toast.success('Integration disconnected');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: () => {
      toast.error('Failed to disconnect integration');
    },
  });

  const getIntegrationData = (providerId: IntegrationProvider) => {
    return integrations?.find((i) => i.provider === providerId);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground">
          Connect your favorite tools to Boardly to supercharge your workflow.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PROVIDERS.map((provider) => {
          const integration = getIntegrationData(provider.id);
          const isConnected = integration?.isConnected;
          const isConnecting = connectingId === provider.id;

          return (
            <Card key={provider.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-muted rounded-lg">
                    <provider.icon className={`h-6 w-6 ${provider.color}`} />
                  </div>
                  {isConnected && (
                    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 dark:text-green-400 ring-1 ring-inset ring-green-500/20">
                      <Check className="mr-1 h-3 w-3" /> Connected
                    </span>
                  )}
                </div>
                <CardTitle className="mt-4">{provider.name}</CardTitle>
                <CardDescription className="h-10 mt-2">{provider.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                {/* Future settings for this integration can go here */}
              </CardContent>
              <CardFooter className="pt-4 border-t border-gray-100">
                {isConnected ? (
                  <Button
                    variant="outline"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => disconnectMutation.mutate(integration!.id)}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="mr-2 h-4 w-4" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => connectMutation.mutate(provider.id)}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Connect
                      </>
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
