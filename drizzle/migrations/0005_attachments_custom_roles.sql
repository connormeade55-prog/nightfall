-- Any single emoji can be a reaction now (not just the first eight).
ALTER TABLE public.chat_message_reactions DROP CONSTRAINT chat_message_reactions_emoji_check;
ALTER TABLE public.chat_message_reactions ADD CONSTRAINT chat_message_reactions_emoji_check
  CHECK (char_length(emoji) BETWEEN 1 AND 16 AND emoji !~ '[A-Za-z0-9<>]');

-- Messages can carry one attachment (image, GIF or file); text becomes optional then.
ALTER TABLE public.chat_messages ADD COLUMN attachment_path text;
ALTER TABLE public.chat_messages ADD COLUMN attachment_name text;
ALTER TABLE public.chat_messages ADD COLUMN attachment_type text;
ALTER TABLE public.chat_messages ADD COLUMN attachment_size integer;

ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_body_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_body_check
  CHECK (char_length(btrim(body)) <= 1000 AND (char_length(btrim(body)) >= 1 OR attachment_path IS NOT NULL));
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_attachment_check
  CHECK (
    attachment_path IS NULL
    OR (
      attachment_path ~ ('^' || room_id::text || '/' || user_id::text || '/[^/]{1,200}$')
      AND char_length(coalesce(attachment_name, '')) BETWEEN 1 AND 200
      AND char_length(coalesce(attachment_type, '')) BETWEEN 1 AND 100
      AND attachment_size BETWEEN 1 AND 26214400
    )
  );

-- Chat files: folder is <room id>/<uploader id>/...; anyone who can read the room can open them.
CREATE POLICY "Room readers can open chat files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_access_room(((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "Room members can upload chat files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_access_room(((storage.foldername(name))[1])::uuid)
  );
CREATE POLICY "Uploaders can delete their chat files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND (storage.foldername(name))[2] = auth.uid()::text);

-- Custom roles: admin-made titles with a color, shown next to people's names.
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 24),
  color text NOT NULL DEFAULT '#8b5cf6' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_custom_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_custom_roles_role_idx ON public.user_custom_roles (role_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
GRANT ALL ON public.user_custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in people can see roles" ON public.custom_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can create roles" ON public.custom_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can edit roles" ON public.custom_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.custom_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Signed-in people can see who has which role" ON public.user_custom_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can assign roles" ON public.user_custom_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can unassign roles" ON public.user_custom_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
