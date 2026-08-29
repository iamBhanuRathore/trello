import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@boardly/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="p-4 rounded-full bg-purple-500/10 text-purple-400">
        <ShieldAlert className="w-12 h-12" />
      </div>
      <h2 className="text-2xl font-bold text-white">404 — Super Admin Route Not Found</h2>
      <p className="text-xs text-muted-foreground max-w-sm">
        The requested platform operations view does not exist or has been relocated.
      </p>
      <Link to="/">
        <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-500 text-white">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Super Admin Overview</span>
        </Button>
      </Link>
    </div>
  );
};
