import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CircleUserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PASSWORD_HINT, passwordError } from "@/lib/password";
import { useAuth } from "@/lib/auth-provider";
import { emailForUsername, normalizeUsername, usernameError } from "@/lib/username";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in" },
      {
        name: "description",
        content: "Sign in or create an account with a username and password.",
      },
      { property: "og:title", content: "Sign in" },
      {
        property: "og:description",
        content: "Sign in or create an account with a username and password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signed-in") void navigate({ to: "/hub", replace: true });
  }, [status, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const handle = normalizeUsername(username);
    const invalid = usernameError(handle);
    if (invalid) {
      setError(invalid);
      return;
    }
    const badPassword =
      mode === "signup" ? passwordError(password) : password ? null : "Enter your password.";
    if (badPassword) {
      setError(badPassword);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailForUsername(handle),
          password,
        });
        if (signInError) {
          setError("That username and password don't match. Try again, or create an account.");
          return;
        }
      } else {
        const { data: taken } = await supabase.rpc("username_taken", { _username: handle });
        if (taken) {
          setError(`@${handle} is already taken. Try another username.`);
          return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email: emailForUsername(handle),
          password,
          options: {
            data: { username: handle, display_name: displayName.trim() || handle },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) {
          setError(
            /taken|exists|duplicate/i.test(signUpError.message)
              ? `@${handle} is already taken. Try another username.`
              : "We couldn't create that account. Try another username.",
          );
          return;
        }
      }

      toast.success(mode === "signin" ? "Signed in." : "Account created.");
      await navigate({ to: "/hub", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-foreground px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-background">
          <CircleUserRound className="h-6 w-6 text-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">Classes</span>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-4xl leading-tight font-semibold text-background">
            One username, one password.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-background/70">
            No email address, no confirmation link to wait for. Pick a username and you're in.
          </p>
        </div>
        <p className="text-xs text-background/70">
          Accounts are username-only, so a forgotten password can't be emailed to you.
        </p>
      </aside>

      <main className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-8">
        <Link
          to="/"
          className="mb-6 inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <Card className="mx-auto w-full max-w-sm border-border/80 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Sign in with the username you chose."
                : "Pick a username — it's how you'll sign in and how you'll be known."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
              {(["signin", "signup"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={
                    value === mode
                      ? "rounded-full bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
                      : "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {value === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="connor"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                />
              </div>

              {mode === "signup" ? (
                <div className="space-y-2">
                  <Label htmlFor="display-name">
                    Display name
                    <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="display-name"
                    name="display-name"
                    autoComplete="nickname"
                    placeholder="Connor Lee"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder={mode === "signup" ? PASSWORD_HINT : "Your password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy
                  ? "One moment…"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Usernames are lowercase and can use letters, numbers, dot, dash or underscore.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
