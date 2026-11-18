import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Home, MessageCircle, Settings, ShieldCheck } from "lucide-react";

import { AdminPage } from "@/routes/admin";
import { ChatPage } from "@/routes/chat";
import { SettingsPage } from "@/routes/settings";
import { ConstellationSky } from "@/components/constellation-sky";
import { useAuth } from "@/lib/auth-provider";

type Section = "home" | "chat" | "settings" | "admin";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nightfall" },
      { name: "description", content: "Your Nightfall home for chat, settings and community tools." },
      { property: "og:title", content: "Nightfall" },
      { property: "og:description", content: "Your Nightfall home for chat, settings and community tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const { status, profile, isAdmin, signOut } = useAuth();
  const [section, setSection] = useState<Section>("home");

  if (status === "signed-out") {
    return (
      <div className="theme-void relative flex min-h-screen items-center justify-center overflow-hidden bg-background text-foreground">
        <ConstellationSky className="pointer-events-none absolute inset-0 h-full w-full opacity-50" />
        <main className="relative z-10 mx-auto max-w-lg px-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-card font-tech text-lg font-bold">NF</div>
          <h1 className="mt-6 font-tech text-5xl font-semibold tracking-tight">Nightfall</h1>
          <p className="mt-4 text-muted-foreground">Sign in to open your Nightfall workspace.</p>
          <Link to="/auth" className="mt-7 inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground hover:opacity-90">Sign in</Link>
        </main>
      </div>
    );
  }

  if (status !== "signed-in") {
    return <div className="theme-void min-h-screen bg-background" />;
  }

  const tabs = [
    { id: "home" as const, label: "Home", icon: Home },
    { id: "chat" as const, label: "Chat", icon: MessageCircle },
    { id: "settings" as const, label: "Settings", icon: Settings },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="theme-void relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <ConstellationSky className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background/70 px-4 py-3 backdrop-blur sm:px-8">
        <button type="button" onClick={() => setSection("home")} className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-xs font-bold tracking-tight ring-1 ring-border">NF</span>
          <span className="text-lg font-medium">Nightfall</span>
        </button>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={section === id
                ? "flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                : "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{profile?.display_name}</span>
          <button type="button" onClick={() => void signOut()} className="rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">Sign out</button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {section === "home" ? (
          <main className="mx-auto grid w-full max-w-7xl flex-1 items-center px-6 py-12 sm:px-10">
            <section className="max-w-2xl">
              <h1 className="text-outline font-tech text-6xl leading-none font-semibold tracking-tight sm:text-7xl xl:text-8xl">Nightfall</h1>
              <p className="mt-8 max-w-md text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Welcome back, {profile?.display_name}. Your chat, account settings and community tools are all here.
              </p>
              <button type="button" onClick={() => setSection("chat")} className="mt-8 inline-flex h-14 items-center gap-3 rounded-full bg-primary px-7 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90">
                Open chat <MessageCircle className="h-4 w-4" />
              </button>
            </section>
          </main>
        ) : section === "chat" ? (
          <ChatPage embedded />
        ) : section === "settings" ? (
          <SettingsPage embedded />
        ) : isAdmin ? (
          <AdminPage embedded />
        ) : null}
      </div>
    </div>
  );
}
