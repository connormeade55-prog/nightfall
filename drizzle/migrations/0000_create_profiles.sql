CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{1,30}$')
);

CREATE UNIQUE INDEX profiles_username_key ON public.profiles (username);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.username_taken(_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username = lower(btrim(coalesce(_username, '')))
  );
$$;

GRANT EXECUTE ON FUNCTION public.username_taken(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  _display_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
BEGIN
  IF _username !~ '^[a-z0-9][a-z0-9._-]{1,30}$' THEN
    RAISE EXCEPTION 'username must be 2-31 characters: letters, numbers, dot, dash or underscore';
  END IF;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, _username, coalesce(nullif(_display_name, ''), _username));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();