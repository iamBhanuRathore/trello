import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import {
  ShieldAlert,
  KanbanSquare,
  Lock,
  Mail,
  ArrowRight,
  RefreshCw,
  KeyRound,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState('alex.vance@acme.corp');
  const [password, setPassword] = useState('Password123!');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      await login({ email: email.trim(), password });
      toast.success('Authenticated as Platform Super Administrator');
      navigate('/');
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        'Authentication failed. Please check credentials.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#09090b] text-foreground flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradient Orbs */}
      <div className="absolute top-[-15%] left-[-10%] w-[550px] h-[550px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[550px] h-[550px] bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6 animate-in fade-in zoom-in-95 duration-300">
        {/* Header Icon & Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 shadow-xl shadow-purple-500/5 mb-1">
            <KanbanSquare className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>Boardly Super Admin</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              OPS
            </span>
          </h1>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Platform-level governance console for multi-tenant clusters, database routing, and cross-company intelligence.
          </p>
        </div>

        {/* Card */}
        <div className="p-7 rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xl shadow-2xl space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Platform Admin Email</span>
                <span className="text-[10px] text-purple-400 font-mono">Requires isPlatformAdmin</span>
              </Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  required
                  type="email"
                  placeholder="admin@platform.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 bg-background/50 text-xs text-white border-border/80 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Password</Label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  required
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 bg-background/50 text-xs text-white border-border/80 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-2.5 rounded-xl shadow-lg shadow-purple-600/25 transition-all gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Privileges...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Super Admin Console</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </form>

          {/* Quick Demo Fill Helper */}
          <div className="pt-3 border-t border-border/60 text-center">
            <button
              type="button"
              onClick={() => {
                setEmail('alex.vance@acme.corp');
                setPassword('Password123!');
              }}
              className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <KeyRound className="w-3 h-3" />
              <span>Click to Autofill CEO / Platform Admin Demo Account</span>
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="text-center text-[11px] text-muted-foreground/80 flex items-center justify-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
          <span>Restricted access. All actions are logged to global audit streams.</span>
        </div>
      </div>
    </div>
  );
};
