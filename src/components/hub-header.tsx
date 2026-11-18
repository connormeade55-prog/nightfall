import { Link } from "@tanstack/react-router";
import { LogOut, School, Settings, ShieldCheck } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnnouncementPopup } from "@/components/announcement-popup";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth } from "@/lib/auth-provider";

export const HUB_NAME = "Nightfall";
const VERSION = "v1.0.0";

const pill =
  "rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";
const activePill = "rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground";

/** Top bar shared by the signed-in hub pages. */
export function HubHeader({ active }: { active: "home" | "chat" | "admin" | "settings" }) {
  const { profile, userId, isAdmin, signOut } = useAuth();

  return (
    <header className="relative z-10 flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-8">
      <div className="flex items-center gap-6">
        <Link to="/hub" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-xs font-bold tracking-tight ring-1 ring-border">
            NF
          </span>
          <span className="text-lg font-medium">{HUB_NAME}</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link to="/chat" className={active === "chat" ? activePill : pill}>
            Chat
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden rounded-md border border-border px-2 py-1 text-xs text-muted-foreground sm:inline">
          {VERSION}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="rounded-full transition-opacity hover:opacity-90"
          >
            <UserAvatar
              path={profile?.avatar_path ?? null}
              name={profile?.display_name ?? "?"}
              className="h-10 w-10 text-sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="theme-void w-56">
            <DropdownMenuLabel>
              <span className="block text-sm font-medium text-popover-foreground">
                {profile?.display_name}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                @{profile?.username}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isAdmin ? (
              <DropdownMenuItem asChild>
                <Link to="/admin">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Admin tools
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/">
                <School className="mr-2 h-4 w-4" />
                Back to Classes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {userId ? <AnnouncementPopup userId={userId} /> : null}
    </header>
  );
}
