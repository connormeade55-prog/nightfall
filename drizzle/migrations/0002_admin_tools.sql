-- Roles live in their own table; never on profiles.
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- The reserved admin username gets the admin role when its account is created.
CREATE OR REPLACE FUNCTION public.grant_reserved_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username = 'blackout.games' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_grant_reserved_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_reserved_admin();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE username = 'blackout.games'
ON CONFLICT DO NOTHING;

-- Admins can see every account's username and display name.
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Chat bans.
CREATE TABLE public.chat_bans (
  user_id uuid PRIMARY KEY,
  banned_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.chat_bans TO authenticated;
GRANT ALL ON public.chat_bans TO service_role;
ALTER TABLE public.chat_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own ban" ON public.chat_bans
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can see all bans" ON public.chat_bans
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can ban others" ON public.chat_bans
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id <> auth.uid() AND banned_by = auth.uid());
CREATE POLICY "Admins can lift bans" ON public.chat_bans
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_chat_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_bans WHERE user_id = auth.uid())
$$;

-- Official rooms: made by an admin, visible to everyone, listed first.
ALTER TABLE public.chat_rooms ADD COLUMN is_official boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_access_room(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_chat_banned() AND (
    EXISTS (SELECT 1 FROM public.chat_rooms WHERE id = _room_id AND is_official)
    OR EXISTS (SELECT 1 FROM public.chat_room_members WHERE room_id = _room_id AND user_id = auth.uid())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_chat_banned() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_banned() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_room(uuid) TO authenticated;

CREATE POLICY "Everyone can view official rooms" ON public.chat_rooms
  FOR SELECT TO authenticated USING (is_official);

GRANT DELETE ON public.chat_rooms TO authenticated;
CREATE POLICY "Admins can remove official rooms" ON public.chat_rooms
  FOR DELETE TO authenticated USING (is_official AND public.has_role(auth.uid(), 'admin'));

DROP POLICY "Members can read room messages" ON public.chat_messages;
DROP POLICY "Members can post in their rooms" ON public.chat_messages;

CREATE POLICY "Allowed people can read room messages" ON public.chat_messages
  FOR SELECT TO authenticated USING (public.can_access_room(room_id));
CREATE POLICY "Allowed people can post in rooms" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_room(room_id));

-- Shared room-code generator.
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _code text;
  _i int;
BEGIN
  LOOP
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.chat_rooms r WHERE r.code = _code);
  END LOOP;
  RETURN _code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_room_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_chat_room(_name text)
RETURNS TABLE (id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _room_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to create a room';
  END IF;
  IF public.is_chat_banned() THEN
    RAISE EXCEPTION 'You are banned from chat';
  END IF;
  IF char_length(btrim(coalesce(_name, ''))) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Room names need 1 to 40 characters';
  END IF;

  _code := public.generate_room_code();
  INSERT INTO public.chat_rooms (name, code, created_by)
  VALUES (btrim(_name), _code, auth.uid())
  RETURNING chat_rooms.id INTO _room_id;
  INSERT INTO public.chat_room_members (room_id, user_id) VALUES (_room_id, auth.uid());
  RETURN QUERY SELECT _room_id, _code;
END;
$$;

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
  IF public.is_chat_banned() THEN
    RAISE EXCEPTION 'You are banned from chat';
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

CREATE OR REPLACE FUNCTION public.create_official_room(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can make official rooms';
  END IF;
  IF char_length(btrim(coalesce(_name, ''))) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Room names need 1 to 40 characters';
  END IF;

  INSERT INTO public.chat_rooms (name, code, created_by, is_official)
  VALUES (btrim(_name), public.generate_room_code(), auth.uid(), true)
  RETURNING chat_rooms.id INTO _room_id;
  RETURN _room_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_official_room(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_official_room(text) TO authenticated;

-- Announcements pop up once for each person after they sign in.
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in people can read announcements" ON public.announcements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can post announcements" ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "Admins can remove announcements" ON public.announcements
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see what they've read" ON public.announcement_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can mark announcements read" ON public.announcement_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
