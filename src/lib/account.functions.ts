import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { passwordError } from "@/lib/password";
import { emailForUsername, normalizeUsername, usernameError } from "@/lib/username";

type Result = { ok: boolean; error?: string };

/**
 * Rename your own account. Sign-in uses an address derived from the username, so the
 * profile and the sign-in address must change together.
 */
export const changeUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => {
    if (typeof input?.username !== "string") throw new Error("Enter a username.");
    return { username: normalizeUsername(input.username) };
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const invalid = usernameError(data.username);
    if (invalid) return { ok: false, error: invalid };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", context.userId)
      .single();
    if (readError || !current) return { ok: false, error: "Couldn't find your account." };
    if (current.username === data.username) return { ok: true };

    const { error: renameError } = await supabaseAdmin
      .from("profiles")
      .update({ username: data.username })
      .eq("id", context.userId);
    if (renameError) {
      if (renameError.code === "23505")
        return { ok: false, error: `@${data.username} is already taken.` };
      console.error("changeUsername profile update failed", renameError);
      return { ok: false, error: "Couldn't change your username. Try again." };
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      email: emailForUsername(data.username),
      email_confirm: true,
      user_metadata: { username: data.username },
    });
    if (authError) {
      console.error("changeUsername sign-in update failed", authError);
      await supabaseAdmin
        .from("profiles")
        .update({ username: current.username })
        .eq("id", context.userId);
      return {
        ok: false,
        error: /already|exists|registered/i.test(authError.message)
          ? `@${data.username} is already taken.`
          : "Couldn't change your username. Try again.",
      };
    }
    return { ok: true };
  });

/** Change your own password after proving you know the current one. */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { currentPassword: string; newPassword: string }) => {
    if (typeof input?.currentPassword !== "string" || typeof input.newPassword !== "string")
      throw new Error("Fill in every password field.");
    return { currentPassword: input.currentPassword, newPassword: input.newPassword };
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const invalid = passwordError(data.newPassword);
    if (invalid) return { ok: false, error: invalid };
    if (data.newPassword === data.currentPassword)
      return { ok: false, error: "Pick a password that's different from your current one." };

    const email = typeof context.claims.email === "string" ? context.claims.email : "";
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!email || !url || !key) return { ok: false, error: "Couldn't check your password." };

    const checker = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
            headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { error: verifyError } = await checker.auth.signInWithPassword({
      email,
      password: data.currentPassword,
    });
    if (verifyError) return { ok: false, error: "Your current password isn't right." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.newPassword,
    });
    if (error) {
      console.error("changePassword failed", error);
      return { ok: false, error: "Couldn't change your password. Try again." };
    }
    return { ok: true };
  });
