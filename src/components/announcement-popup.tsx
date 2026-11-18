import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type Announcement = { id: string; title: string; body: string; created_at: string };

/** Shows announcements this person hasn't closed yet; each one appears only once. */
export function AnnouncementPopup({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const key = ["unread-announcements", userId];

  const unread = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Announcement[]> => {
      const [{ data: items, error }, { data: reads, error: readsError }] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, title, body, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("announcement_reads").select("announcement_id").eq("user_id", userId),
      ]);
      if (error) throw error;
      if (readsError) throw readsError;
      const seen = new Set(reads.map((r) => r.announcement_id));
      return items.filter((a) => !seen.has(a.id));
    },
    staleTime: Infinity,
  });

  const list = unread.data ?? [];

  async function dismiss() {
    queryClient.setQueryData<Announcement[]>(key, []);
    await supabase
      .from("announcement_reads")
      .upsert(
        list.map((a) => ({ announcement_id: a.id, user_id: userId })),
        { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
      );
  }

  return (
    <Dialog open={list.length > 0} onOpenChange={(open) => !open && void dismiss()}>
      <DialogContent className="theme-void max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-tech">
            <Megaphone className="h-5 w-5 text-primary" />
            {list.length === 1 ? "Announcement" : `${list.length} announcements`}
          </DialogTitle>
          <DialogDescription>From the admin</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {list.map((a) => (
            <article key={a.id}>
              <h3 className="font-semibold text-foreground">{a.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
              </p>
              <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p>
            </article>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => void dismiss()}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
