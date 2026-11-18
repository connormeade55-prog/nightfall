import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Temporary link to a file in a private bucket; pass `download` to save it under that name. */
export function useSignedUrl(
  bucket: string,
  path: string | null | undefined,
  download?: string,
): string | null {
  const query = useQuery({
    queryKey: ["signed-url", bucket, path, download ?? null],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path as string, 60 * 60, download ? { download } : undefined);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  return path ? (query.data ?? null) : null;
}
