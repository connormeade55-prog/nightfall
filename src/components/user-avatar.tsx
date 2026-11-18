import { useAvatarUrl } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/** Profile picture with the first letter of the name as the default. */
export function UserAvatar({
  path,
  name,
  className,
  src,
}: {
  path?: string | null | undefined;
  name: string;
  className?: string | undefined;
  /** Overrides the stored picture, e.g. for a preview. */
  src?: string | null | undefined;
}) {
  const stored = useAvatarUrl(src ? null : path);
  const url = src ?? stored;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-bold text-primary-foreground",
        className,
      )}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initial}
    </span>
  );
}
