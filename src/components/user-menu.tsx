import { Link } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name?: string | null) {
  if (!name) return "؟";
  const trimmed = name.trim();
  if (/^\d/.test(trimmed)) return trimmed.slice(-2);
  const parts = trimmed.split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

export function UserMenu() {
  const { displayName, isAdmin, signOut } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2" aria-label="منوی حساب کاربری">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-sm text-muted-foreground sm:inline">
            {displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="space-y-1">
          <span className="block truncate text-xs text-muted-foreground">{displayName}</span>
          {isAdmin && (
            <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              مدیر سامانه
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard" className="gap-2">
            <LayoutDashboard className="size-4" />
            داشبورد
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/profile" className="gap-2">
            <UserIcon className="size-4" />
            پروفایل
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-destructive" onSelect={() => void signOut()}>
          <LogOut className="size-4" />
          خروج از حساب
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
