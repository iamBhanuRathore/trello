import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '@boardly/ui/button';
import { LayoutDashboard as Trello, LogOut, Plus, CheckSquare, Trash2 } from 'lucide-react';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { SearchPalette } from '../components/SearchPalette';
import { ThemeToggle } from '../components/ThemeToggle';
import { TrashBinModal } from '../components/trash/TrashBinModal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@boardly/ui/dropdown-menu';

export function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground transition-colors overflow-hidden">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-4 sm:px-6 py-3 shadow-xs transition-colors">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <Trello className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Boardly</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/my-tasks"
            className="text-sm font-medium text-muted-foreground hover:text-foreground hidden sm:flex items-center gap-1.5 transition-colors"
          >
            <CheckSquare className="w-4 h-4 text-primary" />
            <span>My Tasks</span>
          </Link>
          <Link
            to="/timesheets"
            className="text-sm font-medium text-muted-foreground hover:text-foreground hidden sm:flex items-center gap-1.5 transition-colors"
          >
            Timesheets
          </Link>
          <Link
            to="/marketplace"
            className="text-sm font-medium text-muted-foreground hover:text-foreground hidden md:flex items-center gap-1.5 transition-colors"
          >
            Power-Ups &amp; Apps
          </Link>
          {user?.isPlatformAdmin && (
            <Link
              to="/super-admin"
              className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
            >
              Super Admin
            </Link>
          )}
          <Link
            to="/admin"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Admin Panel
          </Link>
          <NotificationDropdown />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsTrashOpen(true)}
            className="hover:bg-muted text-muted-foreground hover:text-foreground h-9 w-9"
            title="Trash & Recycle Bin (30-day recovery)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <ThemeToggle />
          <SearchPalette triggerContext="navbar" />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="outline"
                size="sm"
                className="hidden md:flex bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
              >
                <Plus className="h-4 w-4 mr-1" /> Create
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/')}>
                Create Workspace
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/')}>
                Create Project
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/')}>
                Create Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2 border-l pl-4 ml-2">
            <Link
              to="/profile"
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/70 transition-colors group"
              title="View & Edit Profile"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || 'Profile'}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-border shadow-xs"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold ring-1 ring-primary/30">
                  {user?.name ? user.name.substring(0, 1).toUpperCase() : 'U'}
                </div>
              )}
              <span className="text-sm font-medium hidden md:inline-block group-hover:text-primary transition-colors">
                {user?.name}
              </span>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              className="hover:bg-destructive/10 hover:text-destructive"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4 md:p-6 overflow-y-auto min-h-0">
        <Outlet />
      </main>

      {/* Trash & Recycle Bin Modal */}
      <TrashBinModal open={isTrashOpen} onOpenChange={setIsTrashOpen} />
    </div>
  );
}
