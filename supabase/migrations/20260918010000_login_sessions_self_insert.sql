-- ====================================================================================================
-- recordLogin() previously depended on POST /api/account/login-event (the deployed backend), which is
-- currently unreachable — sign-ins stopped showing up under Admin > Analytics > Recent sign-ins because
-- that call fails silently (fire-and-forget). Allow users to write their own login row directly instead.
-- ====================================================================================================

GRANT INSERT ON public.login_sessions TO authenticated;

CREATE POLICY "login_sessions_insert_own" ON public.login_sessions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
