import { Link } from "@tanstack/react-router";
import { CircleUserRound, GraduationCap, LayoutGrid, LogOut, Menu, Settings } from "lucide-react";

import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-provider";

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? "";
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/**
 * The account affordance is driven by the session: an icon that opens the sign-in
 * page while signed out, and an account menu with a way out while signed in.
 */
export function SiteHeader() {
  const { status, profile, signOut } = useAuth();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-2 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground">
          <Menu className="h-5 w-5" />
        </span>
        <Link to="/" className="flex items-center gap-2 text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-[1.375rem] font-normal tracking-tight">Classes</span>
        </Link>
      </div>

      {status === "signed-in" && profile ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 transition-colors hover:bg-accent"
            >
              {profile.avatar_path ? (
                <UserAvatar path={profile.avatar_path} name={profile.display_name} className="h-8 w-8 text-xs" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(profile.display_name)}
                </span>
              )}
              <span className="max-w-28 truncate text-sm font-medium text-card-foreground">
                {profile.display_name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block text-sm font-medium text-popover-foreground">
                {profile.display_name}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                @{profile.username}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/hub">
                <LayoutGrid className="mr-2 h-4 w-4" />
                Open hub
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : status === "loading" ? (
        <span className="h-9 w-9 animate-pulse rounded-full bg-muted" />
      ) : (
        <Button asChild variant="ghost" size="sm" className="gap-2 px-3">
          <Link to="/auth">
            <CircleUserRound className="h-5 w-5" />
            <span>Sign in</span>
          </Link>
        </Button>
      )}
    </header>
  );
}
