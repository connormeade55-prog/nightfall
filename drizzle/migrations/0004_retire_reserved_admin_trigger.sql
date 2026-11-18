-- The admin account now exists and holds the role by account, so usernames can be
-- renamed without a future sign-up under the old name inheriting admin rights.
DROP TRIGGER IF EXISTS profiles_grant_reserved_admin ON public.profiles;
COMMENT ON FUNCTION public.grant_reserved_admin() IS 'DEPRECATED: trigger removed once the admin account existed; admin is granted per account in user_roles.';