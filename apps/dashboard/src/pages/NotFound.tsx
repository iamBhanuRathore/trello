import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import { LayoutDashboard, ArrowLeft, LogIn, HelpCircle } from 'lucide-react';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 sm:p-8">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Animated Glow / Badge */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-xl animate-pulse" />
          <div className="relative w-20 h-20 rounded-2xl bg-card border border-border/80 shadow-2xl flex items-center justify-center text-primary">
            <HelpCircle className="w-10 h-10 stroke-[1.75]" />
          </div>
        </div>

        {/* Status code & Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
            Error 404
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Page not found
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sorry, we couldn’t find the page you’re looking for. It may have been deleted, renamed, or temporarily unavailable.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="default"
            className="w-full sm:w-auto gap-2 cursor-pointer"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4" /> Go Back
          </Button>

          {isAuthenticated ? (
            <Link to="/" className="w-full sm:w-auto">
              <Button size="default" className="w-full gap-2 cursor-pointer">
                <LayoutDashboard className="w-4 h-4" /> Return to Dashboard
              </Button>
            </Link>
          ) : (
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="default" className="w-full gap-2 cursor-pointer">
                <LogIn className="w-4 h-4" /> Go to Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
