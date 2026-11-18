import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Ban,
  Copy,
  DoorOpen,
  FileText,
  Hash,
  LogIn,
  MessageCircle,
  Paperclip,
  Pin,
  Plus,
  Send,
  SmilePlus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConstellationSky } from "@/components/constellation-sky";
import { HubHeader } from "@/components/hub-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CallPanel, useRoomCall } from "@/components/room-call";
import { RoleBadge } from "@/components/role-badge";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-provider";
import {
  CHAT_FILES_BUCKET,
  chatFileError,
  chatFilePath,
  formatBytes,
  INLINE_IMAGE_TYPES,
} from "@/lib/chat-files";
import { customRolesQuery, useUserRoles } from "@/lib/custom-roles";
import { splitLinks } from "@/lib/links";
import { QUICK_REACTIONS, summarizeReactions, type Reaction } from "@/lib/reactions";
import { useSignedUrl } from "@/lib/storage-url";

import {
  isCompleteRoomCode,
  MESSAGE_MAX,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX,
} from "@/lib/room-code";

const FullEmojiPicker = lazy(() => import("@/components/emoji-picker"));

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat rooms — Nightfall" },
      {
        name: "description",
        content: "Make your own chat room and share its code so friends can join.",
      },
      { property: "og:title", content: "Chat rooms — Nightfall" },
      {
        property: "og:description",
        content: "Make your own chat room and share its code so friends can join.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

type Room = { id: string; name: string; code: string; created_at: string; is_official: boolean };
type Message = {
  id: string;
  room_id: string;
  user_id: string;
  author_name: string;
  author_avatar_path: string | null;
  body: string;
  created_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
};

const MESSAGE_FIELDS =
  "id, room_id, user_id, author_name, author_avatar_path, body, created_at, attachment_path, attachment_name, attachment_type, attachment_size";

const roomsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["chat-rooms", userId],
    queryFn: async (): Promise<Room[]> => {
      const { data, error } = await supabase
        .from("chat_rooms")
        .select("id, name, code, created_at, is_official")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Official rooms first, in the order the admin made them; then your own rooms, newest first.
      const official = data.filter((r) => r.is_official).reverse();
      return [...official, ...data.filter((r) => !r.is_official)];
    },
  });

const messagesQuery = (roomId: string) =>
  queryOptions({
    queryKey: ["chat-messages", roomId],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select(MESSAGE_FIELDS)
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.reverse();
    },
  });

const reactionsQuery = (roomId: string) =>
  queryOptions({
    queryKey: ["chat-reactions", roomId],
    queryFn: async (): Promise<Reaction[]> => {
      const { data, error } = await supabase
        .from("chat_message_reactions")
        .select("message_id, user_id, emoji, chat_messages!inner(room_id)")
        .eq("chat_messages.room_id", roomId);
      if (error) throw error;
      return data.map(({ message_id, user_id, emoji }) => ({ message_id, user_id, emoji }));
    },
  });

export function ChatPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { status, userId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "signed-out") void navigate({ to: "/auth", replace: true });
  }, [status, navigate]);

  if (status !== "signed-in" || !userId) {
    return <div className="theme-void min-h-screen bg-background" />;
  }

  return (
    <div className={embedded
      ? "theme-void relative flex min-h-[36rem] flex-1 flex-col overflow-hidden bg-background text-foreground"
      : "theme-void relative flex h-screen flex-col overflow-hidden bg-background text-foreground"}>
      <ConstellationSky className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
      {!embedded ? <HubHeader active="chat" /> : null}
      <ChatShell userId={userId} />
    </div>
  );
}

const banQuery = (userId: string) =>
  queryOptions({
    queryKey: ["chat-ban", userId],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("chat_bans")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });

function ChatShell({ userId }: { userId: string }) {
  const ban = useQuery(banQuery(userId));
  if (ban.isPending) return null;
  if (ban.data) {
    return (
      <main className="relative z-10 flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-border bg-card/80 p-8 text-center backdrop-blur">
          <Ban className="mx-auto h-10 w-10 text-destructive" />
          <p className="mt-3 font-tech text-xl font-semibold">You're banned from chat</p>
          <p className="mt-2 text-sm text-muted-foreground">
            An admin turned off chat for your account. The rest of the hub still works.
          </p>
        </div>
      </main>
    );
  }
  return <ChatRooms userId={userId} />;
}

function ChatRooms({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const rooms = useQuery(roomsQuery(userId));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = rooms.data ?? [];
  const selected = list.find((room) => room.id === selectedId) ?? list[0] ?? null;

  async function refreshRooms(selectId?: string) {
    await queryClient.invalidateQueries({ queryKey: ["chat-rooms", userId] });
    if (selectId) setSelectedId(selectId);
  }

  return (
    <main className="relative z-10 mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-rows-[auto_minmax(24rem,1fr)] gap-4 overflow-y-auto p-4 sm:p-6 md:grid-cols-[18rem_1fr] md:grid-rows-1 md:overflow-hidden">
      <aside className="flex min-h-0 flex-col gap-4 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur">
        <CreateRoomForm onCreated={(id) => void refreshRooms(id)} />
        <JoinRoomForm onJoined={(id) => void refreshRooms(id)} />

        <div className="min-h-0 flex-1">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Your rooms
          </p>
          {rooms.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rooms.isError ? (
            <p className="text-sm text-destructive">Couldn't load your rooms. Refresh to try again.</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rooms yet. Make one or join with a code.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto md:max-h-none">
              {list.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(room.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selected?.id === room.id
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    }`}
                  >
                    {room.is_official ? (
                      <Pin className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Hash className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{room.name}</span>
                    {room.is_official ? (
                      <span className="ml-auto shrink-0 text-[0.65rem] tracking-wide text-primary uppercase">
                        Official
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-border bg-card/80 backdrop-blur">
        {selected ? (
          <RoomView
            key={selected.id}
            room={selected}
            userId={userId}
            onLeft={() => {
              setSelectedId(null);
              void refreshRooms();
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground" />
            <p className="font-tech text-xl font-semibold">Start a conversation</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Make a room, then share its 6-character code so friends can join.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function CreateRoomForm({ onCreated }: { onCreated: (roomId: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_chat_room", { _name: trimmed });
    setBusy(false);
    const created = Array.isArray(data) ? data[0] : null;
    if (error || !created) {
      toast.error("Couldn't make that room. Try again.");
      return;
    }
    setName("");
    toast.success(`Room made. Share code ${created.code} to invite people.`);
    onCreated(created.id);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="room-name" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        New room
      </label>
      <div className="flex gap-2">
        <Input
          id="room-name"
          placeholder="Room name"
          maxLength={ROOM_NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" size="icon" aria-label="Make room" disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

function JoinRoomForm({ onJoined }: { onJoined: (roomId: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isCompleteRoomCode(code)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("join_chat_room", { _code: normalizeRoomCode(code) });
    setBusy(false);
    if (error) {
      toast.error("Couldn't join right now. Try again.");
      return;
    }
    if (!data) {
      toast.error("No room has that code. Check it and try again.");
      return;
    }
    setCode("");
    toast.success("You joined the room.");
    onJoined(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="room-code" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Join with a code
      </label>
      <div className="flex gap-2">
        <Input
          id="room-code"
          placeholder="ABC123"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-tech tracking-[0.3em] uppercase"
          maxLength={ROOM_CODE_LENGTH + 4}
          value={code}
          onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          aria-label="Join room"
          disabled={busy || !isCompleteRoomCode(code)}
        >
          <LogIn className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

function RoomView({ room, userId, onLeft }: { room: Room; userId: string; onLeft: () => void }) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const messages = useQuery(messagesQuery(room.id));
  const reactions = useQuery(reactionsQuery(room.id));
  useQuery(customRolesQuery);
  const myName = profile?.display_name ?? "Me";
  const call = useRoomCall(room.id, { userId, name: myName });
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesKey = ["chat-messages", room.id];
  const reactionsKey = ["chat-reactions", room.id];

  function upsertMessage(message: Message) {
    queryClient.setQueryData<Message[]>(messagesKey, (current = []) =>
      current.some((m) => m.id === message.id)
        ? current.map((m) => (m.id === message.id ? { ...m, ...message } : m))
        : [...current, message],
    );
  }

  function dropMessage(id: string) {
    queryClient.setQueryData<Message[]>(messagesKey, (current = []) => current.filter((m) => m.id !== id));
  }

  function inThisRoom(messageId: string) {
    return (queryClient.getQueryData<Message[]>(messagesKey) ?? []).some((m) => m.id === messageId);
  }

  // Live updates: messages, deletions, name/picture changes and reactions from everyone.
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${room.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${room.id}` },
        (payload) => upsertMessage(payload.new as Message),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `room_id=eq.${room.id}` },
        (payload) => upsertMessage(payload.new as Message),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) dropMessage(id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_reactions" }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Partial<Reaction>;
        if (row.message_id && inThisRoom(row.message_id)) {
          void queryClient.invalidateQueries({ queryKey: reactionsKey });
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.data?.length]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    let attachment = {};
    if (file) {
      const path = chatFilePath(room.id, userId, file.name);
      const { error: uploadError } = await supabase.storage
        .from(CHAT_FILES_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) {
        setSending(false);
        toast.error("Couldn't upload that file. Try again.");
        return;
      }
      attachment = {
        attachment_path: path,
        attachment_name: file.name.slice(0, 200) || "file",
        attachment_type: (file.type || "application/octet-stream").slice(0, 100),
        attachment_size: file.size,
      };
    }
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ room_id: room.id, user_id: userId, body, ...attachment })
      .select(MESSAGE_FIELDS)
      .single();
    setSending(false);
    if (error || !data) {
      if ("attachment_path" in attachment)
        void supabase.storage.from(CHAT_FILES_BUCKET).remove([attachment.attachment_path as string]);
      void queryClient.invalidateQueries({ queryKey: ["chat-ban", userId] });
      toast.error("Your message didn't send. Try again.");
      return;
    }
    setDraft("");
    setFile(null);
    upsertMessage(data);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const list = queryClient.getQueryData<Reaction[]>(reactionsKey) ?? [];
    const mine = list.some((r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);
    queryClient.setQueryData<Reaction[]>(reactionsKey, (current = []) =>
      mine
        ? current.filter((r) => !(r.message_id === messageId && r.user_id === userId && r.emoji === emoji))
        : [...current, { message_id: messageId, user_id: userId, emoji }],
    );
    const { error } = mine
      ? await supabase
          .from("chat_message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", userId)
          .eq("emoji", emoji)
      : await supabase
          .from("chat_message_reactions")
          .upsert(
            { message_id: messageId, user_id: userId, emoji },
            { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true },
          );
    if (error) {
      toast.error("Couldn't update your reaction. Try again.");
      void queryClient.invalidateQueries({ queryKey: reactionsKey });
    }
  }

  function pickFile(picked: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!picked) return;
    const problem = chatFileError(picked);
    if (problem) {
      toast.error(problem);
      return;
    }
    setFile(picked);
  }

  async function deleteMessage(messageId: string) {
    const previous = queryClient.getQueryData<Message[]>(messagesKey);
    const attachmentPath = previous?.find((m) => m.id === messageId)?.attachment_path;
    dropMessage(messageId);
    const { error, count } = await supabase
      .from("chat_messages")
      .delete({ count: "exact" })
      .eq("id", messageId)
      .eq("user_id", userId);
    if (error || count === 0) {
      queryClient.setQueryData(messagesKey, previous);
      toast.error("Couldn't delete that message. Try again.");
      return;
    }
    if (attachmentPath) void supabase.storage.from(CHAT_FILES_BUCKET).remove([attachmentPath]);
    toast.success("Message deleted.");
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      toast.success("Code copied.");
    } catch {
      toast(`The code is ${room.code}`);
    }
  }

  async function leave() {
    const { error } = await supabase
      .from("chat_room_members")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", userId);
    if (error) {
      toast.error("Couldn't leave the room. Try again.");
      return;
    }
    queryClient.removeQueries({ queryKey: messagesKey });
    toast.success(`You left ${room.name}.`);
    onLeft();
  }

  const list = messages.data ?? [];
  const allReactions = reactions.data ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-tech text-lg font-semibold">{room.name}</p>
          <p className="text-xs text-muted-foreground">
            {room.is_official ? "Official room · everyone can see this" : "Share the code so others can join"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {call.joined ? null : (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => void call.join()}
              disabled={call.joining}
            >
              <Video className="h-4 w-4" />
              {call.participants.length > 0 ? `Join call (${call.participants.length})` : "Start call"}
            </Button>
          )}
        {room.is_official ? null : (
          <>
            <button
              type="button"
              onClick={() => void copyCode()}
              aria-label={`Copy room code ${room.code}`}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-tech text-sm tracking-[0.25em] transition-colors hover:bg-accent"
            >
              {room.code}
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  <DoorOpen className="h-4 w-4" />
                  Leave
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="theme-void">
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave {room.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You'll stop seeing its messages. You can rejoin later with the code {room.code}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Stay</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void leave()}>Leave room</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        </div>
      </div>

      {call.joined ? <CallPanel call={call} myName={myName} myAvatar={profile?.avatar_path ?? null} /> : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.isPending ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : messages.isError ? (
          <p className="text-sm text-destructive">Couldn't load messages. Refresh to try again.</p>
        ) : list.length === 0 ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">No messages yet. Say hi!</p>
        ) : (
          list.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              mine={message.user_id === userId}
              reactions={summarizeReactions(allReactions, message.id, userId)}
              onReact={(emoji) => void toggleReaction(message.id, emoji)}
              onDelete={() => void deleteMessage(message.id)}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {file ? (
        <div className="flex items-center gap-2 border-t border-border px-4 pt-3 text-sm">
          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Remove attachment"
            className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <form onSubmit={handleSend} className={`flex gap-2 p-3 ${file ? "" : "border-t border-border"}`}>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          aria-label="Attach a file"
          onChange={(event) => pickFile(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Attach image or file"
          className="h-11 w-11 shrink-0 rounded-full"
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          aria-label="Message"
          placeholder={`Message ${room.name}`}
          maxLength={MESSAGE_MAX}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-11 rounded-full"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={sending || (!draft.trim() && !file)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}

function MessageRow({
  message,
  mine,
  reactions,
  onReact,
  onDelete,
}: {
  message: Message;
  mine: boolean;
  reactions: ReturnType<typeof summarizeReactions>;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const roles = useUserRoles(message.user_id);
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const hasBody = message.body.trim().length > 0;

  function pick(emoji: string) {
    onReact(emoji);
    setPickerOpen(false);
    setShowAll(false);
  }

  const actions = (
    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <Popover
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setShowAll(false);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add reaction"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align={mine ? "end" : "start"} className="theme-void w-auto p-1.5">
          {showAll ? (
            <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading emoji…</p>}>
              <FullEmojiPicker onPick={pick} />
            </Suspense>
          ) : (
            <div className="flex flex-wrap items-center gap-0.5">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React with ${emoji}`}
                  onClick={() => pick(emoji)}
                  className="rounded-lg p-1.5 text-xl transition-transform hover:scale-125 hover:bg-accent active:scale-95"
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                aria-label="All emoji"
                onClick={() => setShowAll(true)}
                className="ml-0.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {mine ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              aria-label="Delete message"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="theme-void">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this message?</AlertDialogTitle>
              <AlertDialogDescription>
                It will be removed for everyone in the room. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete message
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );

  return (
    <div className={`group flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {mine ? null : (
        <UserAvatar path={message.author_avatar_path} name={message.author_name} className="mt-5 h-8 w-8 text-xs" />
      )}
      <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
        <span className={`mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground ${mine ? "justify-end" : ""}`}>
          <span>{mine ? "You" : message.author_name}</span>
          {roles.map((role) => (
            <RoleBadge key={role.id} role={role} />
          ))}
          <span>· {time}</span>
        </span>
        <div className={`flex min-w-0 max-w-full items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
          <div className={`flex min-w-0 max-w-full flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
            {message.attachment_path ? <Attachment message={message} mine={mine} /> : null}
            {hasBody ? (
              <p
                className={`min-w-0 max-w-full rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] ${
                  mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                <LinkedText text={message.body} />
              </p>
            ) : null}
          </div>
          {actions}
        </div>
        {reactions.length > 0 ? (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(r.emoji)}
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ", tap to remove yours" : ""}`}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  r.mine
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                <span className="text-sm">{r.emoji}</span>
                {r.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Message text with web links turned into clickable links that open in a new tab. */
function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.kind === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** A sent picture/GIF shows inline; any other file is a download card. */
function Attachment({ message, mine }: { message: Message; mine: boolean }) {
  const name = message.attachment_name ?? "file";
  const isImage = INLINE_IMAGE_TYPES.includes(message.attachment_type ?? "");
  const viewUrl = useSignedUrl(CHAT_FILES_BUCKET, isImage ? message.attachment_path : null);
  const downloadUrl = useSignedUrl(CHAT_FILES_BUCKET, message.attachment_path, name);

  if (isImage) {
    return viewUrl ? (
      <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="block max-w-full">
        <img
          src={viewUrl}
          alt={name}
          loading="lazy"
          className="max-h-72 max-w-full rounded-2xl border border-border object-contain"
        />
      </a>
    ) : (
      <div className="h-40 w-56 max-w-full animate-pulse rounded-2xl bg-muted" aria-label="Loading picture" />
    );
  }

  return (
    <a
      href={downloadUrl ?? undefined}
      aria-disabled={!downloadUrl}
      className={`flex min-w-0 max-w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
        mine ? "border-primary/40 bg-primary/15" : "border-border bg-muted"
      } ${downloadUrl ? "hover:bg-accent" : "pointer-events-none opacity-70"}`}
    >
      <FileText className="h-6 w-6 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{name}</span>
        <span className="block text-xs text-muted-foreground">
          {formatBytes(message.attachment_size ?? 0)} · Download
        </span>
      </span>
    </a>
  );
}
