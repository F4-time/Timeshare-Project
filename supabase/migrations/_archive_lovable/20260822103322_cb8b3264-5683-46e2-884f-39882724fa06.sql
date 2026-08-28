REVOKE EXECUTE ON FUNCTION public.notify_reservation_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_maintenance_fee_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_membership_contract_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_ownership_contract_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_ticket_message_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_exchange_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_payout_event() FROM PUBLIC, anon, authenticated;