import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Eye, EyeOff, ImageUp, Loader2, Settings, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { ConstellationSky } from "@/components/constellation-sky";
import { HubHeader } from "@/components/hub-header";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { changePassword, changeUsername } from "@/lib/account.functions";
import { useAuth, type Profile } from "@/lib/auth-provider";
import { AVATAR_ACCEPT, AVATAR_BUCKET, avatarFileError, shrinkAvatar } from "@/lib/avatar";
import { PASSWORD_HINT, PASSWORD_MAX, passwordError } from "@/lib/password";
import { normalizeUsername, usernameError } from "@/lib/username";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — Nightfall" },
      {
        name: "description",
        content: "Change your display name, username, password and profile picture.",
      },
      { property: "og:title", content: "Account settings — Nightfall" },
      {
        property: "og:description",
        content: "Change your display name, username, password and profile picture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const DISPLAY_NAME_MAX = 40;

function SettingsPage() {
  const { status, profile, userId } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out") void navigate({ to: "/auth", replace: true });
  }, [status, navigate]);

  if (status !== "signed-in" || !profile || !userId) {
    return <div className="theme-void min-h-screen bg-background" />;
  }

  function goBack() {
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: "/hub" });
  }

  return (
    <div className="theme-void relative min-h-screen overflow-hidden bg-background text-foreground">
      <ConstellationSky className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
      <HubHeader active="settings" />
      <main className="relative z-10 mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="mt-2 flex items-center gap-3 font-tech text-3xl font-semibold">
            <Settings className="h-7 w-7 text-primary" /> Account settings
          </h1>
        </div>
        <ProfileInfoSection profile={profile} userId={userId} />
        <UsernameSection profile={profile} />
        <PasswordSection />
        <PictureSection profile={profile} userId={userId} />
      </main>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6">
      <h2 className="font-tech text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ProfileInfoSection({ profile, userId }: { profile: Profile; userId: string }) {
  const { refreshProfile } = useAuth();
  const [name, setName] = useState(profile.display_name);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const changed = trimmed !== profile.display_name;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) {
      toast.error("Your display name can't be empty.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", userId);
    setBusy(false);
    if (error) {
      toast.error("Couldn't save your display name. Try again.");
      return;
    }
    await refreshProfile();
    toast.success("Display name saved.");
  }

  return (
    <Section title="Profile information" description="This is the name people see in chat.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            maxLength={DISPLAY_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Username: <span className="text-foreground">@{profile.username}</span>
        </p>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !changed}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
          </Button>
          {changed ? (
            <Button type="button" variant="ghost" onClick={() => setName(profile.display_name)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

function UsernameSection({ profile }: { profile: Profile }) {
  const { refreshProfile } = useAuth();
  const save = useServerFn(changeUsername);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<boolean | null>(null);

  const handle = normalizeUsername(value);
  const invalid = handle ? usernameError(handle) : null;
  const same = handle === profile.username;

  useEffect(() => {
    setTaken(null);
    if (!handle || invalid || same) return;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.rpc("username_taken", { _username: handle });
      setTaken(Boolean(data));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [handle, invalid, same]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = usernameError(handle);
    if (problem) return setError(problem);
    if (same) return setError("That's already your username.");
    setBusy(true);
    try {
      const result = await save({ data: { username: handle } });
      if (!result.ok) {
        setError(result.error ?? "Couldn't change your username.");
        toast.error(result.error ?? "Couldn't change your username.");
        return;
      }
      await refreshProfile();
      setValue("");
      toast.success(`You're now @${handle}. Use it next time you sign in.`);
    } catch {
      setError("Couldn't change your username. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const status =
    error ??
    (invalid
      ? invalid
      : same
        ? "That's already your username."
        : taken === true
          ? `@${handle} is already taken.`
          : taken === false
            ? `@${handle} is available.`
            : null);
  const statusIsGood = !error && !invalid && !same && taken === false;

  return (
    <Section title="Change username" description="You'll sign in with your new username from now on.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Current username: <span className="text-foreground">@{profile.username}</span>
        </p>
        <div className="space-y-2">
          <Label htmlFor="new-username">New username</Label>
          <Input
            id="new-username"
            autoComplete="off"
            spellCheck={false}
            maxLength={31}
            placeholder="2 to 31 characters"
            value={value}
            onChange={(e) => {
              setError(null);
              setValue(e.target.value.toLowerCase());
            }}
          />
          {handle && status ? (
            <p role="status" className={`text-sm ${statusIsGood ? "text-primary" : "text-destructive"}`}>
              {status}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !handle || Boolean(invalid) || same || taken === true}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
          </Button>
          {value ? (
            <Button type="button" variant="ghost" onClick={() => setValue("")}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          maxLength={PASSWORD_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function PasswordSection() {
  const save = useServerFn(changePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!current) return setError("Enter your current password.");
    const problem = passwordError(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      const result = await save({ data: { currentPassword: current, newPassword: next } });
      if (!result.ok) {
        setError(result.error ?? "Couldn't change your password.");
        toast.error(result.error ?? "Couldn't change your password.");
        return;
      }
      reset();
      toast.success("Password changed.");
    } catch {
      setError("Couldn't change your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const dirty = Boolean(current || next || confirm);

  return (
    <Section title="Change password" description={PASSWORD_HINT}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField id="current-password" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField id="new-password" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
          </Button>
          {dirty ? (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

function PictureSection({ profile, userId }: { profile: Profile; userId: string }) {
  const { refreshProfile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ blob: Blob; ext: "webp" | "jpg"; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (pending) URL.revokeObjectURL(pending.preview);
  }, [pending]);

  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = avatarFileError(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      const shrunk = await shrinkAvatar(file);
      setPending({ ...shrunk, preview: URL.createObjectURL(shrunk.blob) });
    } catch {
      toast.error("Couldn't read that image. Try a different one.");
    }
  }

  async function removeOld(path: string | null) {
    if (path) await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  }

  async function handleSave() {
    if (!pending) return;
    setBusy(true);
    const path = `${userId}/${Date.now()}.${pending.ext}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, pending.blob, { contentType: pending.blob.type, upsert: false });
    if (uploadError) {
      setBusy(false);
      toast.error("Couldn't upload that picture. Try again.");
      return;
    }
    const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
    if (error) {
      await removeOld(path);
      setBusy(false);
      toast.error("Couldn't save your picture. Try again.");
      return;
    }
    await removeOld(profile.avatar_path);
    await refreshProfile();
    setPending(null);
    setBusy(false);
    toast.success("Profile picture saved.");
  }

  async function handleRemove() {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", userId);
    if (error) {
      setBusy(false);
      toast.error("Couldn't remove your picture. Try again.");
      return;
    }
    await removeOld(profile.avatar_path);
    await refreshProfile();
    setBusy(false);
    toast.success("Picture removed. You're back to the default.");
  }

  return (
    <Section title="Profile picture" description="PNG, JPG or WEBP up to 8 MB. We shrink it to a small square.">
      <div className="flex flex-wrap items-center gap-5">
        <UserAvatar
          path={profile.avatar_path}
          src={pending?.preview ?? null}
          name={profile.display_name}
          className="h-24 w-24 text-3xl ring-2 ring-border"
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPT.join(",")}
            className="hidden"
            aria-label="Choose a profile picture"
            onChange={(e) => void handlePick(e)}
          />
          {pending ? (
            <>
              <Button onClick={() => void handleSave()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save picture
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={busy}>
                <ImageUp className="h-4 w-4" /> Upload picture
              </Button>
              {profile.avatar_path ? (
                <Button variant="ghost" className="gap-1.5" onClick={() => void handleRemove()} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Remove picture
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {pending ? <p className="mt-3 text-sm text-muted-foreground">This is a preview. Save to keep it.</p> : null}
    </Section>
  );
}
