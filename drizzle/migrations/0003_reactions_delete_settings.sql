-- Admins can see who else is an admin.
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profile pictures live in the private avatars bucket under the owner's folder.
ALTER TABLE public.profiles ADD COLUMN avatar_path text;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_path_own_folder
  CHECK (avatar_path IS NULL OR avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(webp|jpg|jpeg|png)$'));

-- Usernames change only through the server (sign-in depends on them).
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_path) ON public.profiles TO authenticated;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_length
  CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40) NOT VALID;

-- Messages carry the author's current name and picture.
ALTER TABLE public.chat_messages ADD COLUMN author_avatar_path text;

CREATE OR REPLACE FUNCTION public.set_chat_message_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.body := btrim(NEW.body);
  NEW.created_at := now();
  SELECT COALESCE(NULLIF(display_name, ''), username), avatar_path
    INTO NEW.author_name, NEW.author_avatar_path
  FROM public.profiles WHERE id = NEW.user_id;
  NEW.author_name := COALESCE(NEW.author_name, 'Someone');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_message_authors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_messages
  SET author_name = COALESCE(NULLIF(NEW.display_name, ''), NEW.username),
      author_avatar_path = NEW.avatar_path
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_sync_message_authors
  AFTER UPDATE OF username, display_name, avatar_path ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_message_authors();

-- People can delete their own messages (gone for everyone).
GRANT DELETE ON public.chat_messages TO authenticated;
CREATE POLICY "Authors can delete their messages" ON public.chat_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Emoji reactions.
CREATE TABLE public.chat_message_reactions (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🔥', '👎', '👏')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX chat_message_reactions_message_idx ON public.chat_message_reactions (message_id);

GRANT SELECT, INSERT, DELETE ON public.chat_message_reactions TO authenticated;
GRANT ALL ON public.chat_message_reactions TO service_role;
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_message(_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_messages m
    WHERE m.id = _message_id AND public.can_access_room(m.room_id)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_message(uuid) TO authenticated;

CREATE POLICY "Room readers can see reactions" ON public.chat_message_reactions
  FOR SELECT TO authenticated USING (public.can_access_message(message_id));
CREATE POLICY "Room readers can react" ON public.chat_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_message(message_id));
CREATE POLICY "People can remove their reactions" ON public.chat_message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;

-- Avatar files: signed-in people can view; owners manage their own folder.
CREATE POLICY "Signed-in people can view avatars" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Owners can upload avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('webp', 'jpg', 'jpeg', 'png')
  );
CREATE POLICY "Owners can replace avatars" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners can delete avatars" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
