import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, getApiErrorMessage } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Eye, EyeOff, AlertCircle, LayoutDashboard, Loader2 } from 'lucide-react';

export function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

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
      const res = await api.post('/auth/sign-up', {
        name,
        email,
        password,
        orgName,
        orgSlug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
      login(res.data);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to create account. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[45%] relative overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-primary/70 items-center justify-center p-12">
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-black/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-sm">
          <div className="flex items-center gap-3 mb-10">
            <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
              <LayoutDashboard className="h-7 w-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Boardly</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">Start for free today</h1>
          <p className="text-white/75 text-lg leading-relaxed">
            Set up your team workspace in seconds. No credit card required.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12 bg-background overflow-y-auto">
        <div className="w-full max-w-[440px]">
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Boardly</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground mb-1">
              Create your account
            </h2>
            <p className="text-sm text-muted-foreground">Get started with your team workspace</p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive animate-in fade-in-50 duration-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm font-medium leading-snug">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name" className="text-sm font-medium">
                  Full name
                </Label>
                <Input
                  id="signup-name"
                  placeholder="Jane Smith"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 bg-muted/40 border-border/60 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-org" className="text-sm font-medium">
                  Organization
                </Label>
                <Input
                  id="signup-org"
                  placeholder="Acme Corp"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="h-11 bg-muted/40 border-border/60 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signup-email" className="text-sm font-medium">
                Work email
              </Label>
              <Input
                id="signup-email"
                type="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-muted/40 border-border/60 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signup-password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-11 bg-muted/40 border-border/60 focus:border-primary transition-all"
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-muted"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold gap-2 cursor-pointer mt-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-primary hover:text-primary/80 transition-colors underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
