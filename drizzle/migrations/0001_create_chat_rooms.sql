-- Rooms people create; each has a short join code to share.
CREATE TABLE public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_room_members (
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_room_created_idx ON public.chat_messages (room_id, created_at);

GRANT SELECT ON public.chat_rooms TO authenticated;
GRANT SELECT, DELETE ON public.chat_room_members TO authenticated;
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_rooms TO service_role;
GRANT ALL ON public.chat_room_members TO service_role;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Membership check that bypasses RLS so policies don't recurse.
CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = _room_id AND user_id = auth.uid()
  )
$$;

CREATE POLICY "Members can view their rooms" ON public.chat_rooms
  FOR SELECT TO authenticated USING (public.is_room_member(id));

CREATE POLICY "Users can view own memberships" ON public.chat_room_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can leave rooms" ON public.chat_room_members
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Members can read room messages" ON public.chat_messages
  FOR SELECT TO authenticated USING (public.is_room_member(room_id));

CREATE POLICY "Members can post in their rooms" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_room_member(room_id));

-- Author name comes from the poster's profile, never from the client.
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
  SELECT COALESCE(NULLIF(display_name, ''), username) INTO NEW.author_name
  FROM public.profiles WHERE id = NEW.user_id;
  NEW.author_name := COALESCE(NEW.author_name, 'Someone');
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_set_author
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_chat_message_author();

-- Create a room with a unique 6-character code; the creator joins it.
CREATE OR REPLACE FUNCTION public.create_chat_room(_name text)
RETURNS TABLE (id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _code text;
  _room_id uuid;
  _i int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to create a room';
  END IF;
  IF char_length(btrim(coalesce(_name, ''))) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Room names need 1 to 40 characters';
  END IF;

  LOOP
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.chat_rooms r WHERE r.code = _code);
  END LOOP;

  INSERT INTO public.chat_rooms (name, code, created_by)
  VALUES (btrim(_name), _code, auth.uid())
  RETURNING chat_rooms.id INTO _room_id;

  INSERT INTO public.chat_room_members (room_id, user_id) VALUES (_room_id, auth.uid());

  RETURN QUERY SELECT _room_id, _code;
END;
$$;

-- Join a room by its code; returns the room id, or null when no room has that code.
CREATE OR REPLACE FUNCTION public.join_chat_room(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to join a room';
  END IF;

  SELECT r.id INTO _room_id FROM public.chat_rooms r
  WHERE r.code = upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));

  IF _room_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.chat_room_members (room_id, user_id)
  VALUES (_room_id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN _room_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_chat_room(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_chat_room(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_room_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_chat_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_chat_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
