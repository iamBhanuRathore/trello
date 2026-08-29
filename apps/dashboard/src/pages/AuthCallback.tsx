import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeWorkOSCode } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { toast } from 'sonner';

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isExchanging = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setStatus('error');
      setErrorMessage(errorDescription || `Authentication failed: ${errorParam}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMessage('No authorization code found in callback URL.');
      return;
    }

    if (isExchanging.current) return;
    isExchanging.current = true;

    async function handleExchange() {
      try {
        const data = await exchangeWorkOSCode(code!);
        login(data);
        setStatus('success');
        toast.success(`Welcome back, ${data.user?.name || 'User'}!`);
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 600);
      } catch (err: any) {
        setStatus('error');
        const detail =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to complete Single Sign-On authentication. Please try again.';
        setErrorMessage(detail);
      }
    }

    handleExchange();
  }, [searchParams, login, navigate]);

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-8 shadow-xl backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-foreground">Boardly</span>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-16 w-16 rounded-full bg-primary/15 animate-ping opacity-60" />
              <div className="p-4 rounded-full bg-primary/10 text-primary">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Verifying authentication</h2>
              <p className="text-sm text-muted-foreground">
                Connecting with identity provider &amp; preparing your workspace...
              </p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4 animate-in fade-in-50 duration-300">
            <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Authentication successful!</h2>
              <p className="text-sm text-muted-foreground">
                Redirecting you to your projects and boards...
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-4 text-center space-y-5 animate-in fade-in-50 duration-300">
            <div className="p-4 rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">Authentication failed</h2>
              <p className="text-sm text-muted-foreground leading-relaxed px-2">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2 w-full">
              <Button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full h-11 gap-2 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
