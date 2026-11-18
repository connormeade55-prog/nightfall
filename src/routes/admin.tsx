import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, KeyRound, Megaphone, Pin, Plus, ShieldCheck, Tag, Trash2, UserCheck, UserX } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConstellationSky } from "@/components/constellation-sky";
import { HubHeader } from "@/components/hub-header";
import { RoleBadge } from "@/components/role-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { deleteUserAccount, setUserPassword } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-provider";
import { customRolesQuery, type CustomRole } from "@/lib/custom-roles";
import { passwordError } from "@/lib/password";
import { ROOM_NAME_MAX } from "@/lib/room-code";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin tools — Nightfall" },
      {
        name: "description",
        content: "Manage accounts, chat bans, official rooms and announcements.",
      },
      { property: "og:title", content: "Admin tools — Nightfall" },
      {
        property: "og:description",
        content: "Manage accounts, chat bans, official rooms and announcements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Person = { id: string; username: string; display_name: string; created_at: string };

const card = "rounded-2xl border border-border bg-card/80 p-5 backdrop-blur";
const heading = "flex items-center gap-2 font-tech text-lg font-semibold";

export function AdminPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { status, isAdmin, userId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "signed-out") void navigate({ to: "/auth", replace: true });
    if (status === "signed-in" && !isAdmin) void navigate({ to: "/", replace: true });
  }, [status, isAdmin, navigate]);

  if (status !== "signed-in" || !isAdmin || !userId) {
    return <div className="theme-void min-h-screen bg-background" />;
  }

  return (
    <div className="theme-void relative min-h-screen overflow-hidden bg-background text-foreground">
      <ConstellationSky className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
      {!embedded ? <HubHeader active="admin" /> : null}
      <main className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="flex items-center gap-3 font-tech text-3xl font-semibold">
            <ShieldCheck className="h-7 w-7 text-primary" /> Admin tools
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Passwords are stored scrambled and can't be shown to anyone. You can set a new one instead.
          </p>
        </div>
        <PeoplePanel myId={userId} />
        <RolesPanel />
        <div className="grid gap-6 lg:grid-cols-2">
          <OfficialRoomsPanel />
          <AnnouncementsPanel myId={userId} />
        </div>
      </main>
    </div>
  );
}

function PeoplePanel({ myId }: { myId: string }) {
  const queryClient = useQueryClient();
  const [resetFor, setResetFor] = useState<Person | null>(null);
  const [deleteFor, setDeleteFor] = useState<Person | null>(null);
  const [filter, setFilter] = useState("");
  const roles = useQuery(customRolesQuery);

  const people = useQuery({
    queryKey: ["admin-people"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: bans, error: bansError }, { data: admins }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, username, display_name, created_at")
            .order("created_at", { ascending: true }),
          supabase.from("chat_bans").select("user_id"),
          supabase.from("user_roles").select("user_id").eq("role", "admin"),
        ]);
      if (error) throw error;
      if (bansError) throw bansError;
      return {
        profiles: profiles as Person[],
        banned: new Set(bans.map((b) => b.user_id)),
        admins: new Set((admins ?? []).map((a) => a.user_id)),
      };
    },
  });

  async function toggleBan(person: Person, banned: boolean) {
    const { error } = banned
      ? await supabase.from("chat_bans").delete().eq("user_id", person.id)
      : await supabase.from("chat_bans").insert({ user_id: person.id, banned_by: myId });
    if (error) {
      toast.error("That didn't work. Try again.");
      return;
    }
    toast.success(banned ? `@${person.username} can chat again.` : `@${person.username} is banned from chat.`);
    await queryClient.invalidateQueries({ queryKey: ["admin-people"] });
  }

  const q = filter.trim().toLowerCase();
  const list = (people.data?.profiles ?? []).filter(
    (p) => !q || p.username.includes(q) || p.display_name.toLowerCase().includes(q),
  );

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={heading}>
          Accounts{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {people.data ? `(${people.data.profiles.length})` : ""}
          </span>
        </h2>
        <Input
          aria-label="Search accounts"
          placeholder="Search usernames…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {people.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : people.isError ? (
        <p className="mt-4 text-sm text-destructive">Couldn't load accounts. Refresh to try again.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {list.map((person) => {
            const banned = people.data.banned.has(person.id);
            const admin = people.data.admins.has(person.id);
            const me = person.id === myId;
            return (
              <li key={person.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {person.display_name}{" "}
                    {admin ? (
                      <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                        Admin
                      </span>
                    ) : null}
                    {(roles.data?.byUser[person.id] ?? []).map((role) => (
                      <span key={role.id} className="ml-1 align-middle">
                        <RoleBadge role={role} />
                      </span>
                    ))}
                    {banned ? (
                      <span className="ml-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                        Banned from chat
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    @{person.username} · joined {new Date(person.created_at).toLocaleDateString()}
                  </p>
                </div>
                <AssignRoles person={person} roles={roles.data?.roles ?? []} assigned={roles.data?.byUser[person.id] ?? []} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setResetFor(person)}>
                  <KeyRound className="h-4 w-4" /> Set password
                </Button>
                {me ? null : (
                  <Button
                    variant={banned ? "outline" : "destructive"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void toggleBan(person, banned)}
                  >
                    {banned ? <UserCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    {banned ? "Unban" : "Ban from chat"}
                  </Button>
                )}
                {me ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:bg-destructive/15 hover:text-destructive"
                    onClick={() => setDeleteFor(person)}
                  >
                    <UserX className="h-4 w-4" /> Delete
                  </Button>
                )}
              </li>
            );
          })}
          {list.length === 0 ? (
            <li className="py-3 text-sm text-muted-foreground">No accounts match.</li>
          ) : null}
        </ul>
      )}

      <SetPasswordDialog person={resetFor} onClose={() => setResetFor(null)} />
      <DeleteAccountDialog person={deleteFor} onClose={() => setDeleteFor(null)} />
    </section>
  );
}

function DeleteAccountDialog({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const remove = useServerFn(deleteUserAccount);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!person) return;
    setBusy(true);
    try {
      const result = await remove({ data: { userId: person.id } });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't delete that account.");
        return;
      }
      toast.success(`@${person.username} was deleted.`);
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-people"] }),
        queryClient.invalidateQueries({ queryKey: ["custom-roles"] }),
      ]);
    } catch {
      toast.error("Couldn't delete that account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={person !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent className="theme-void">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete @{person?.username}?</AlertDialogTitle>
          <AlertDialogDescription>
            Their account, messages, files and reactions are removed for good. They won't be able to sign in. This
            can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep account</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Deleting…" : "Delete account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AssignRoles({
  person,
  roles,
  assigned,
}: {
  person: Person;
  roles: CustomRole[];
  assigned: CustomRole[];
}) {
  const queryClient = useQueryClient();
  const has = new Set(assigned.map((r) => r.id));

  async function toggle(role: CustomRole, on: boolean) {
    const { error } = on
      ? await supabase.from("user_custom_roles").insert({ user_id: person.id, role_id: role.id })
      : await supabase.from("user_custom_roles").delete().eq("user_id", person.id).eq("role_id", role.id);
    if (error) {
      toast.error("That didn't work. Try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Tag className="h-4 w-4" /> Roles
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="theme-void w-56 p-2">
        <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">Roles for @{person.username}</p>
        {roles.length === 0 ? (
          <p className="px-2 pb-2 text-sm text-muted-foreground">Make a role below first.</p>
        ) : (
          <ul className="space-y-0.5">
            {roles.map((role) => (
              <li key={role.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                  <Checkbox
                    checked={has.has(role.id)}
                    onCheckedChange={(checked) => void toggle(role, checked === true)}
                    aria-label={`${role.name} role`}
                  />
                  <RoleBadge role={role} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

const ROLE_NAME_MAX = 24;

/** Saves a short moment after you stop dragging, so one pick is one change. */
function RoleColorInput({ role, onSave }: { role: CustomRole; onSave: (color: string) => void }) {
  const [value, setValue] = useState(role.color);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setValue(role.color), [role.color]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <input
      type="color"
      aria-label={`${role.name} color`}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (next.toLowerCase() !== role.color.toLowerCase()) onSave(next);
        }, 600);
      }}
      className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
    />
  );
}

function RolesPanel() {
  const queryClient = useQueryClient();
  const roles = useQuery(customRolesQuery);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const { error } = await supabase.from("custom_roles").insert({ name: trimmed, color });
    setBusy(false);
    if (error) {
      toast.error("Couldn't make that role. Try again.");
      return;
    }
    setName("");
    toast.success(`${trimmed} role made. Give it to people with the Roles button.`);
    await refresh();
  }

  async function recolor(role: CustomRole, next: string) {
    const { error } = await supabase.from("custom_roles").update({ color: next }).eq("id", role.id);
    if (error) toast.error("Couldn't change that color.");
    await refresh();
  }

  async function remove(role: CustomRole) {
    const { error } = await supabase.from("custom_roles").delete().eq("id", role.id);
    if (error) {
      toast.error("Couldn't remove that role.");
      return;
    }
    toast.success(`${role.name} was removed from everyone.`);
    await refresh();
  }

  return (
    <section className={card}>
      <h2 className={heading}>
        <Tag className="h-5 w-5 text-primary" /> Roles
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Titles shown next to people's names in chat. Pick a color, then hand them out from the accounts list.
      </p>
      <form onSubmit={handleCreate} className="mt-4 flex flex-wrap gap-2">
        <Input
          aria-label="Role name"
          placeholder="Role name, e.g. Moderator"
          maxLength={ROLE_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <input
          type="color"
          aria-label="Role color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
        />
        {name.trim() ? <RoleBadge role={{ id: "preview", name: name.trim(), color }} /> : null}
        <Button type="submit" className="gap-1.5" disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" /> Add role
        </Button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2">
        {(roles.data?.roles ?? []).map((role) => (
          <li key={role.id} className="flex items-center gap-2 rounded-lg bg-muted/40 py-1 pr-1 pl-3">
            <RoleBadge role={role} />
            <RoleColorInput role={role} onSave={(next) => void recolor(role, next)} />
            <Button variant="ghost" size="icon" aria-label={`Remove ${role.name} role`} onClick={() => void remove(role)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {roles.data?.roles.length === 0 ? <li className="text-sm text-muted-foreground">No roles yet.</li> : null}
      </ul>
    </section>
  );
}

function SetPasswordDialog({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const save = useServerFn(setUserPassword);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPassword("");
    setError(null);
  }, [person?.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!person) return;
    const invalid = passwordError(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const result = await save({ data: { userId: person.id, password } });
      if (!result.ok) {
        setError(result.error ?? "Couldn't change that password.");
        return;
      }
      toast.success(`@${person.username}'s password was changed.`);
      onClose();
    } catch {
      setError("Couldn't change that password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="theme-void">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              For @{person?.username}. Their old password stops working right away, so tell them the new one.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            autoComplete="off"
            aria-label="New password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OfficialRoomsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const rooms = useQuery({
    queryKey: ["admin-official-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_rooms")
        .select("id, name, created_at")
        .eq("is_official", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-official-rooms"] }),
      queryClient.invalidateQueries({ queryKey: ["chat-rooms"] }),
    ]);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_official_room", { _name: trimmed });
    setBusy(false);
    if (error) {
      toast.error("Couldn't make that room. Try again.");
      return;
    }
    setName("");
    toast.success(`${trimmed} now shows at the top of everyone's chat.`);
    await refresh();
  }

  async function remove(id: string, roomName: string) {
    const { error } = await supabase.from("chat_rooms").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't remove that room.");
      return;
    }
    toast.success(`${roomName} was removed.`);
    await refresh();
  }

  return (
    <section className={card}>
      <h2 className={heading}>
        <Pin className="h-5 w-5 text-primary" /> Official rooms
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Everyone can see these, listed first in Chat. No code needed.
      </p>
      <form onSubmit={handleCreate} className="mt-4 flex gap-2">
        <Input
          aria-label="Official room name"
          placeholder="Room name"
          maxLength={ROOM_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" className="gap-1.5" disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
      <ul className="mt-4 space-y-2">
        {(rooms.data ?? []).map((room) => (
          <li key={room.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <span className="truncate text-sm">#{room.name}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${room.name}`}
              onClick={() => void remove(room.id, room.name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {rooms.data?.length === 0 ? (
          <li className="text-sm text-muted-foreground">No official rooms yet.</li>
        ) : null}
      </ul>
    </section>
  );
}

function AnnouncementsPanel({ myId }: { myId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handlePost(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("announcements")
      .insert({ title: title.trim(), body: body.trim(), created_by: myId })
      .select("id")
      .single();
    if (data) {
      // The admin wrote it, so it shouldn't pop up for them.
      await supabase.from("announcement_reads").insert({ announcement_id: data.id, user_id: myId });
    }
    setBusy(false);
    if (error) {
      toast.error("Couldn't post that. Try again.");
      return;
    }
    setTitle("");
    setBody("");
    toast.success("Posted. Everyone sees it the next time they sign in or open the hub.");
    await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't remove that announcement.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
  }

  return (
    <section className={card}>
      <h2 className={heading}>
        <Megaphone className="h-5 w-5 text-primary" /> Announcements
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pops up once for each person after they sign in.
      </p>
      <form onSubmit={handlePost} className="mt-4 space-y-2">
        <Input
          aria-label="Announcement title"
          placeholder="Title"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          aria-label="Announcement message"
          placeholder="What do you want everyone to know?"
          maxLength={2000}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>
          Post announcement
        </Button>
      </form>
      <ul className="mt-4 space-y-2">
        {(items.data ?? []).map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Remove ${a.title}`} onClick={() => void remove(a.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
