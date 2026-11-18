import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useEffect } from "react";

import { HUB_NAME, HubHeader } from "@/components/hub-header";
import { ConstellationSky } from "@/components/constellation-sky";
import { useAuth } from "@/lib/auth-provider";

export const Route = createFileRoute("/hub")({
  head: () => ({
    meta: [
      { title: "Nightfall — your hub" },
      {
        name: "description",
        content: "Your signed-in hub: jump into chat rooms and catch up with friends.",
      },
      { property: "og:title", content: "Nightfall — your hub" },
      {
        property: "og:description",
        content: "Your signed-in hub: jump into chat rooms and catch up with friends.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LegacyRouteRedirect,
});

function LegacyRouteRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}

const APP_NAME = HUB_NAME;

function HubPage() {
  const { status, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "signed-out") void navigate({ to: "/auth", replace: true });
  }, [status, navigate]);

  if (status !== "signed-in") {
    return <div className="theme-void min-h-screen bg-background" />;
  }

  return (
    <div className="theme-void relative min-h-screen overflow-hidden bg-background text-foreground">
      <ConstellationSky className="pointer-events-none absolute inset-0 h-full w-full" />

      <HubHeader active="home" />

      <main className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-6 py-12 sm:px-10 lg:min-h-[calc(100vh-4.5rem)] lg:py-0">
        <section className="max-w-2xl">
          <h1 className="text-outline font-tech text-6xl leading-none font-semibold tracking-tight sm:text-7xl xl:text-8xl">
            {APP_NAME}
          </h1>
          <p className="mt-10 max-w-md text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Welcome back, {profile?.display_name}. Jump into a chat room and catch up with
            everyone.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/chat"
              className="flex h-14 items-center gap-3 rounded-full bg-primary px-7 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Chat rooms <MessageCircle className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
