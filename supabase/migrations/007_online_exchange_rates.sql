-- Allow the trusted exchange-rate Edge Function to refresh cached daily quotes.
-- The service-role key must remain server-side and must never be placed in browser code.
grant insert, update on public.exchange_rates to service_role;
