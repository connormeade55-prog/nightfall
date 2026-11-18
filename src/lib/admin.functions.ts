import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { passwordError } from "@/lib/password";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin-only: give an account a new password. Passwords are never readable, only replaceable. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => {
    if (typeof input?.userId !== "string" || !UUID.test(input.userId)) {
      throw new Error("Unknown account.");
    }
    if (typeof input.password !== "string") throw new Error("Enter a password.");
    const invalid = passwordError(input.password);
    if (invalid) throw new Error(invalid);
    return { userId: input.userId, password: input.password };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) return { ok: false, error: "Only admins can change passwords." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) {
      console.error("setUserPassword failed", error);
      return { ok: false, error: "Couldn't change that password. Try again." };
    }
    return { ok: true };
  });

/** Admin-only: permanently remove an account and everything it posted. Admins can't delete themselves. */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (typeof input?.userId !== "string" || !UUID.test(input.userId)) {
      throw new Error("Unknown account.");
    }
    return { userId: input.userId };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) return { ok: false, error: "Only admins can delete accounts." };
    if (data.userId === context.userId) return { ok: false, error: "You can't delete your own account here." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.userId;

    // Uploaded chat files and the profile picture live in storage, keyed by the owner's id.
    const { data: files } = await supabaseAdmin
      .from("chat_messages")
      .select("attachment_path")
      .eq("user_id", id)
      .not("attachment_path", "is", null);
    const chatPaths = (files ?? []).map((f) => f.attachment_path as string);
    if (chatPaths.length) await supabaseAdmin.storage.from("chat-files").remove(chatPaths);
    const { data: avatarFiles } = await supabaseAdmin.storage.from("avatars").list(id);
    if (avatarFiles?.length) {
      await supabaseAdmin.storage.from("avatars").remove(avatarFiles.map((f) => `${id}/${f.name}`));
    }

    const cleanups = await Promise.all([
      supabaseAdmin.from("chat_message_reactions").delete().eq("user_id", id),
      supabaseAdmin.from("chat_messages").delete().eq("user_id", id),
      supabaseAdmin.from("chat_room_members").delete().eq("user_id", id),
      supabaseAdmin.from("user_custom_roles").delete().eq("user_id", id),
      supabaseAdmin.from("chat_bans").delete().eq("user_id", id),
      supabaseAdmin.from("announcement_reads").delete().eq("user_id", id),
    ]);
    const failed = cleanups.find((r) => r.error);
    if (failed?.error) {
      console.error("deleteUserAccount cleanup failed", failed.error);
      return { ok: false, error: "Couldn't delete that account. Try again." };
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      console.error("deleteUserAccount failed", error);
      return { ok: false, error: "Couldn't delete that account. Try again." };
    }
    return { ok: true };
  });
