import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSSOConfig, updateSSOConfig, getSSOLoginUrl } from '../../lib/api';
import {
  KeyRound,
  ShieldCheck,
  Users,
  Copy,
  Check,
  Lock,
  Globe,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Switch } from '@boardly/ui/switch';

export function SSOSettings() {
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState('okta');
  const [domain, setDomain] = useState('');
  const [idpMetadataUrl, setIdpMetadataUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scimEnabled, setScimEnabled] = useState(false);
  const [enforceSSO, setEnforceSSO] = useState(false);

  const [copiedToken, setCopiedToken] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['ssoConfig'],
    queryFn: () => getSSOConfig(),
  });

  useEffect(() => {
    if (config) {
      setProvider(config.provider || 'okta');
      setDomain(config.domain || '');
      setIdpMetadataUrl(config.idpMetadataUrl || '');
      setClientId(config.clientId || '');
      setClientSecret(config.clientSecret || '');
      setScimEnabled(!!config.scimEnabled);
      setEnforceSSO(!!config.enforceSSO);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) => updateSSOConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssoConfig'] });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      provider,
      domain,
      idpMetadataUrl,
      clientId,
      clientSecret,
      scimEnabled,
      enforceSSO,
    });
  };

  const handleTestSSO = async () => {
    setTestError(null);
    setTestResult(null);
    if (!domain.trim()) {
      setTestError('Please configure a corporate domain first.');
      return;
    }
    try {
      const res = await getSSOLoginUrl(domain.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestError(err.response?.data?.error || 'SSO connection test failed.');
    }
  };

  const copySCIMToken = () => {
    if (!config?.scimToken) return;
    navigator.clipboard.writeText(config.scimToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading SSO &amp; directory sync settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Enterprise SSO &amp; Directory Sync</h1>
            <p className="text-sm text-muted-foreground">
              Configure SAML 2.0 / OIDC identity providers, automated SCIM provisioning, and authentication policies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestSSO}
            className="text-xs h-9 gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Test SSO Connection
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="text-xs h-9"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>

      {/* Diagnostics Banner */}
      {testResult && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs space-y-1.5">
          <div className="font-semibold flex items-center gap-1.5">
            <Check className="w-4 h-4" /> SSO Endpoint Operational
          </div>
          <p className="text-[11px] opacity-90">
            Redirect URL generated successfully for domain @{testResult.domain}:{' '}
            <span className="font-mono">{testResult.loginUrl}</span>
          </p>
        </div>
      )}

      {testError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs">
          <strong>Diagnostic Error:</strong> {testError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* SECTION 1: Identity Provider Configuration */}
        <div className="p-6 rounded-2xl border bg-card/80 shadow-xs space-y-6">
          <div className="space-y-1 border-b pb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Single Sign-On (SAML / OIDC)
            </h2>
            <p className="text-xs text-muted-foreground">
              Select your enterprise identity provider to enable passwordless employee authentication.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { id: 'okta', name: 'Okta', desc: 'SAML 2.0 & OIDC' },
              { id: 'azure_ad', name: 'Microsoft Entra', desc: 'Azure AD / Office 365' },
              { id: 'google_saml', name: 'Google Workspace', desc: 'SAML SSO' },
              { id: 'custom_oidc', name: 'Custom OIDC', desc: 'Generic Provider' },
            ].map((idp) => (
              <div
                key={idp.id}
                onClick={() => setProvider(idp.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1 ${
                  provider === idp.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:border-muted-foreground/30 bg-muted/20'
                }`}
              >
                <div className="font-semibold text-sm">{idp.name}</div>
                <div className="text-[11px] text-muted-foreground">{idp.desc}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium">Verified Corporate Email Domain</Label>
              <Input
                placeholder="e.g. acme.corp or mycompany.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                className="text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Users attempting login with @{domain || 'yourdomain.com'} will be routed to your IdP.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium">IdP Metadata URL / Issuer URI</Label>
              <Input
                placeholder="https://dev-123456.okta.com/app/exk123/sso/saml/metadata"
                value={idpMetadataUrl}
                onChange={(e) => setIdpMetadataUrl(e.target.value)}
                className="text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Client ID / App ID</Label>
              <Input
                placeholder="0oa1234567890abcdef"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Client Secret / Certificate</Label>
              <Input
                type="password"
                placeholder="••••••••••••••••••••••••••••••"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: SCIM 2.0 Automated User Provisioning */}
        <div className="p-6 rounded-2xl border bg-card/80 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> SCIM 2.0 Directory Sync
              </h2>
              <p className="text-xs text-muted-foreground">
                Automatically provision, update, and deactivate team accounts directly from your IdP directory.
              </p>
            </div>
            <Switch checked={scimEnabled} onCheckedChange={setScimEnabled} />
          </div>

          {scimEnabled && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">SCIM Base Endpoint URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin.replace(':5173', ':3001')}/v1/sso/scim`}
                    className="text-xs h-9 font-mono bg-muted/40"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin.replace(':5173', ':3001')}/v1/sso/scim`
                      );
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">SCIM Bearer Token</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={config?.scimToken || 'Token will generate on save'}
                    className="text-xs h-9 font-mono bg-muted/40"
                  />
                  {config?.scimToken && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs gap-1"
                      onClick={copySCIMToken}
                    >
                      {copiedToken ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: Enforcement & Security Policy */}
        <div className="p-6 rounded-2xl border bg-card/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" /> Enforce SSO for All Members
              </h2>
              <p className="text-xs text-muted-foreground">
                Disable standard password-based sign in and mandate IdP authentication for all accounts on @{domain || 'yourdomain.com'}.
              </p>
            </div>
            <Switch checked={enforceSSO} onCheckedChange={setEnforceSSO} />
          </div>
        </div>
      </form>
    </div>
  );
}
