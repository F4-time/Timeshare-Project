REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_row_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_row_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_row_mutation() TO service_role;