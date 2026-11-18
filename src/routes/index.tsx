import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderClosed, TrendingUp } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/lib/auth-provider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Classes" },
      { name: "description", content: "Your classes, all in one place." },
      { property: "og:title", content: "Classes" },
      { property: "og:description", content: "Your classes, all in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const CLASSES = [
  { name: "Algebra II", section: "Period 1", teacher: "Ms. Rivera", banner: "bg-banner-1" },
  { name: "AP Biology", section: "Period 2", teacher: "Mr. Chen", banner: "bg-banner-2" },
  { name: "English 10", section: "Period 3", teacher: "Mrs. Patel", banner: "bg-banner-3" },
  { name: "World History", section: "Period 4", teacher: "Mr. Okafor", banner: "bg-banner-4" },
  { name: "Chemistry", section: "Period 5", teacher: "Dr. Lindqvist", banner: "bg-banner-5" },
  { name: "Spanish II", section: "Period 6", teacher: "Sra. Morales", banner: "bg-banner-6" },
];

function Index() {
  const { status, profile } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {status === "signed-out" ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">Sign in to see your own classes.</p>
            <Link
              to="/auth"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sign in
            </Link>
          </div>
        ) : profile ? (
          <p className="mb-6 text-sm text-muted-foreground">Welcome back, {profile.display_name}</p>
        ) : null}

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CLASSES.map((c) => (
            <li
              key={c.name}
              className="flex h-72 flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className={`${c.banner} relative h-24 px-4 pt-4 text-primary-foreground`}>
                <p className="truncate text-[1.375rem] leading-tight hover:underline">{c.name}</p>
                <p className="truncate text-sm">{c.section}</p>
                <p className="mt-1 truncate text-xs opacity-90">{c.teacher}</p>
                <span className="absolute right-4 -bottom-9 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-muted text-2xl font-medium text-muted-foreground">
                  {c.teacher.replace(/^\S+\s/, "").charAt(0)}
                </span>
              </div>
              <div className="flex-1" />
              <div className="flex justify-end gap-1 border-t border-border px-2 py-2 text-muted-foreground">
                <span className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
                  <FolderClosed className="h-5 w-5" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
