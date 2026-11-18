import { queryOptions, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CustomRole = { id: string; name: string; color: string };

export const customRolesQuery = queryOptions({
  queryKey: ["custom-roles"],
  queryFn: async () => {
    const [{ data: roles, error }, { data: links, error: linksError }] = await Promise.all([
      supabase.from("custom_roles").select("id, name, color").order("created_at", { ascending: true }),
      supabase.from("user_custom_roles").select("user_id, role_id"),
    ]);
    if (error) throw error;
    if (linksError) throw linksError;
    const byId = new Map(roles.map((r) => [r.id, r]));
    const byUser: Record<string, CustomRole[]> = {};
    for (const link of links) {
      const role = byId.get(link.role_id);
      if (role) (byUser[link.user_id] ??= []).push(role);
    }
    return { roles: roles as CustomRole[], byUser };
  },
  staleTime: 60 * 1000,
});

/** Titles to show next to a person's name. */
export function useUserRoles(userId: string): CustomRole[] {
  const { data } = useQuery(customRolesQuery);
  return data?.byUser[userId] ?? [];
}
