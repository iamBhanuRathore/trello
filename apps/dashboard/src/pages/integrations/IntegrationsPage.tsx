import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@boardly/ui/tabs';
import { Layers } from 'lucide-react';
import { AppsTab } from './AppsTab';
import { ApiKeysTab } from './ApiKeysTab';
import { InboundTab } from './InboundTab';
import { OutboundTab } from './OutboundTab';
import { EventWebhooksTab } from './EventWebhooksTab';

const TABS = [
  { value: 'apps', label: 'Apps' },
  { value: 'api-keys', label: 'API Keys' },
  { value: 'inbound', label: 'Inbound' },
  { value: 'outbound', label: 'Outbound' },
  { value: 'webhooks', label: 'Event Webhooks' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function tabFromPath(pathname: string): TabValue {
  if (pathname.endsWith('/api-keys')) return 'api-keys';
  if (pathname.endsWith('/inbound')) return 'inbound';
  if (pathname.endsWith('/outbound')) return 'outbound';
  if (pathname.endsWith('/webhooks')) return 'webhooks';
  return 'apps';
}

export function IntegrationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = tabFromPath(location.pathname);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-16">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Layers className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Apps, API access, inbound URLs, and outbound event delivery in one place.
          </p>
        </div>
      </header>

      <Tabs
        value={active}
        onValueChange={(value) => {
          const next = value as TabValue;
          navigate(next === 'apps' ? '/admin/integrations' : `/admin/integrations/${next}`);
        }}
      >
        <TabsList aria-label="Integration hub sections">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="apps">
          <AppsTab />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="inbound">
          <InboundTab />
        </TabsContent>
        <TabsContent value="outbound">
          <OutboundTab />
        </TabsContent>
        <TabsContent value="webhooks">
          <EventWebhooksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
