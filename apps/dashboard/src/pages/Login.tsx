import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, getGoogleAuthUrl, getWorkOSSSOAuthUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  Eye,
  EyeOff,
  AlertCircle,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
  Shield,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // SSO Expandable State
  const [showSSO, setShowSSO] = useState(false);
  const [ssoDomain, setSsoDomain] = useState('');
  const [isSSOLoading, setIsSSOLoading] = useState(false);
  const [ssoError, setSsoError] = useState('');

  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await api.post('/auth/sign-in', { email, password });
      login(res.data);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Invalid email or password. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isGoogleLoading) return;
    setError('');
    setIsGoogleLoading(true);
    try {
      const res = await getGoogleAuthUrl();
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      } else {
        throw new Error('Failed to generate Google authentication URL');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to connect to Google OAuth service. Please try again.'
      );
      setIsGoogleLoading(false);
    }
  };

  const handleSSOLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ssoDomain.trim() || isSSOLoading) return;
    setSsoError('');
    setIsSSOLoading(true);
    try {
      const res = await getWorkOSSSOAuthUrl(ssoDomain.trim());
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      } else {
        throw new Error('Failed to generate Single Sign-On URL');
      }
    } catch (err: any) {
      setSsoError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          `No Single Sign-On configured for domain "${ssoDomain}".`
      );
      setIsSSOLoading(false);
    }
  };

  const features = [
    'Kanban boards with drag-and-drop',
    'Real-time team collaboration',
    'Subtasks, checklists & time tracking',
    'Smart automations & workflows',
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-primary/70 items-center justify-center p-12">
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-black/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-3 mb-10">
            <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
              <LayoutDashboard className="h-7 w-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Boardly</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Ship faster with your team
          </h1>
          <p className="text-white/75 text-lg mb-10 leading-relaxed">
            The all-in-one project management platform built for modern engineering teams.
          </p>
          <ul className="space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-white/90 text-sm">
                <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12 bg-background overflow-y-auto">
        <div className="w-full max-w-[420px] my-auto">
          <div className="flex items-center gap-2.5 mb-6 lg:hidden">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Boardly</span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground mb-1">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive animate-in fade-in-50 duration-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm font-medium leading-snug">{error}</p>
            </div>
          )}

          {/* Social Sign-In (Google OAuth via WorkOS) */}
          <div className="space-y-3 mb-5">
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isLoading}
              className="w-full h-11 border-border/80 hover:bg-muted/60 font-medium text-sm flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer"
            >
              {isGoogleLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </Button>

            <div className="relative flex items-center justify-center py-1">
              <div className="w-full border-t border-border/60" />
              <span className="absolute bg-background px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Or with email
              </span>
            </div>
          </div>

          {/* Email + Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-sm font-medium">
                Email address
              </Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-muted/30 border-border/70 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-11 bg-muted/30 border-border/70 focus:border-primary transition-all"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold gap-2 cursor-pointer shadow-sm"
              disabled={isLoading || isGoogleLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Enterprise SSO Accordion / Section */}
          <div className="mt-5 pt-4 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowSSO((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                Enterprise Single Sign-On (SSO)
              </span>
              {showSSO ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showSSO && (
              <form
                onSubmit={handleSSOLogin}
                className="mt-3 p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-3 animate-in fade-in-50 duration-200"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="sso-domain" className="text-xs font-medium text-muted-foreground">
                    Corporate domain or work email
                  </Label>
                  <Input
                    id="sso-domain"
                    type="text"
                    placeholder="e.g. acme.com or alex@acme.com"
                    value={ssoDomain}
                    onChange={(e) => setSsoDomain(e.target.value)}
                    required
                    className="h-9 text-xs bg-background border-border/80"
                  />
                </div>

                {ssoError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {ssoError}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isSSOLoading || !ssoDomain.trim()}
                  className="w-full h-9 text-xs font-medium gap-1.5 cursor-pointer"
                >
                  {isSSOLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting to IdP...
                    </>
                  ) : (
                    <>
                      Continue with SSO
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link
              to="/signup"
              className="font-semibold text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
            >
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
