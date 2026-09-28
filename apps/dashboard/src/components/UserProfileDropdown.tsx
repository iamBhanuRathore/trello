import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { User, Settings, Palette, Shield, LogOut, ChevronDown } from 'lucide-react';

interface UserProfileDropdownProps {
  onOpenAppearance?: () => void;
  onItemClick?: () => void;
  variant?: 'navbar' | 'sidebar';
  isCollapsed?: boolean;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({
  onOpenAppearance,
  onItemClick,
  variant = 'navbar',
  isCollapsed = false,
  align = 'end',
  side,
  className,
}) => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const resolvedSide = side || (variant === 'sidebar' ? 'top' : 'bottom');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === 'navbar' ? (
            <div
              role="button"
              tabIndex={0}
              className={`flex items-center gap-2 py-1 px-1.5 rounded-xl hover:bg-muted/70 transition-all cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-primary/30 select-none ${className || ''}`}
              title={user?.name || 'User Profile'}
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || 'User'}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-border shadow-xs shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold ring-1 ring-primary/30 shrink-0">
                  {user?.name ? user.name.substring(0, 1).toUpperCase() : 'U'}
                </div>
              )}
              <span className="text-xs font-semibold hidden lg:inline-block max-w-[130px] truncate text-foreground">
                {user?.name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden lg:inline-block shrink-0 opacity-60" />
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              className={`flex items-center rounded-xl hover:bg-sidebar-accent transition-colors cursor-pointer select-none ${
                isCollapsed ? 'w-8 h-8 justify-center p-0' : 'gap-2.5 p-1.5 w-full text-left'
              } ${className || ''}`}
              title={user?.name || 'User Profile'}
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || 'User'}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-border shadow-2xs shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold ring-1 ring-primary/30 shrink-0">
                  {user?.name ? user.name.substring(0, 1).toUpperCase() : 'U'}
                </div>
              )}
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                    {user?.name || 'User'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate leading-tight">
                    {user?.email || 'Logged In'}
                  </p>
                </div>
              )}
            </div>
          )
        }
      />
      <DropdownMenuContent
        align={align}
        side={resolvedSide}
        sideOffset={8}
        className="w-64 min-w-[260px] p-2 rounded-2xl border border-border/80 shadow-xl bg-popover/98 backdrop-blur-md animate-in fade-in-50 zoom-in-95 duration-150 z-50"
      >
        {/* User Profile Card Header */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/50 mb-1.5">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name || 'User'}
              className="w-9 h-9 rounded-full object-cover ring-1 ring-border shadow-xs shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold ring-1 ring-primary/30 shrink-0">
              {user?.name ? user.name.substring(0, 1).toUpperCase() : 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate leading-snug">
              {user?.name || 'User'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate leading-snug">{user?.email}</p>
            {user?.role && (
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                {user.role.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <div className="space-y-0.5">
          <DropdownMenuItem
            className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 hover:bg-muted/80 transition-colors"
            onClick={() => {
              navigate('/profile');
              onItemClick?.();
            }}
          >
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Profile Settings</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 hover:bg-muted/80 transition-colors"
            onClick={() => {
              navigate('/settings/notifications');
              onItemClick?.();
            }}
          >
            <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Notification Preferences</span>
          </DropdownMenuItem>

          {onOpenAppearance && (
            <DropdownMenuItem
              className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 hover:bg-muted/80 transition-colors"
              onClick={() => {
                onOpenAppearance();
                onItemClick?.();
              }}
            >
              <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>Theme &amp; Appearance</span>
            </DropdownMenuItem>
          )}

          {user?.isPlatformAdmin && (
            <DropdownMenuItem
              className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 text-primary hover:bg-primary/10 transition-colors"
              onClick={() => {
                window.open('http://localhost:5174', '_blank');
                onItemClick?.();
              }}
            >
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <span>Super Admin Portal</span>
            </DropdownMenuItem>
          )}
        </div>

        <DropdownMenuSeparator className="my-1.5" />

        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer text-xs font-medium px-2.5 py-2 rounded-lg gap-2.5 text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4 text-destructive shrink-0" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
