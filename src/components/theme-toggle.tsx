import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle, ready } = useTheme();
  const isDark = ready && theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "حالت روشن" : "حالت تاریک"}
      title={isDark ? "حالت روشن" : "حالت تاریک"}
      {...(className ? { className } : {})}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
