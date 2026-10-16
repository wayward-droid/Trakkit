-- 008: Repair the planning tables and add the online exchange-rate cache RPC.
--
-- Migration 001 created a legacy `budgets` table (category + month based).
-- Migration 005 declared the planning version of `budgets` with
-- `create table if not exists`, so the legacy table was left in place and the
-- Budgets page failed with "column budgets.name does not exist".
--
-- This migration safely replaces the legacy table only when the planning
-- schema is missing, keeps it when it is already correct, and installs all of
-- the supporting policies, grants and triggers idempotently. It also adds a
-- validated SECURITY DEFINER RPC so the browser can cache the daily online
-- rates it fetches directly from the provider.
begin;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'budgets')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'budgets'
               and column_name = 'name') then
    drop table public.budgets cascade;
  end if;
end $$;

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  period text not null default 'monthly' check (period in ('weekly','monthly','yearly')),
  category_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  target_amount numeric(14,2) not null check (target_amount > 0 and target_amount < 1000000000000),
  saved_amount numeric(14,2) not null default 0 check (saved_amount >= 0 and saved_amount <= target_amount),
  target_date date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  frequency text not null default 'monthly' check (frequency in ('weekly','monthly','yearly')),
  next_due date not null,
  status text not null default 'active' check (status in ('active','paused','paid')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Workspace-scoped read/write access through the SECURITY DEFINER role helper.
-- Direct workspace_members access is intentionally revoked from authenticated.
do $$
declare t text;
begin
  foreach t in array array['budgets','savings_goals','recurring_bills'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', t || '_workspace_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_workspace_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_workspace_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_workspace_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (private.workspace_role(workspace_id) is not null)',
      t || '_workspace_read', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.workspace_role(workspace_id) in (''owner'',''admin'',''accountant'',''member''))',
      t || '_workspace_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.workspace_role(workspace_id) in (''owner'',''admin'',''accountant'',''member'')) with check (private.workspace_role(workspace_id) in (''owner'',''admin'',''accountant'',''member''))',
      t || '_workspace_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.workspace_role(workspace_id) in (''owner'',''admin'',''accountant''))',
      t || '_workspace_delete', t
    );
  end loop;
end $$;

-- Preserve the audit trail and money-setup guard migration 001 attached to budgets.
drop trigger if exists budgets_audit on public.budgets;
create trigger budgets_audit after insert or update or delete on public.budgets
  for each row execute function private.write_audit();
drop trigger if exists budgets_guard on public.budgets;
create trigger budgets_guard before insert or update on public.budgets
  for each row execute function private.guard_money_setup();

-- Validated cache writer so the browser can store online rates it fetched
-- directly. Runs as definer so exchange_rates stays closed to direct writes.
create or replace function public.cache_exchange_rates(p_provider text, p_rates jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_provider is null or char_length(btrim(p_provider)) < 1
     or char_length(btrim(p_provider)) > 40 then
    raise exception 'Invalid rate provider';
  end if;
  if p_rates is null or jsonb_typeof(p_rates) <> 'array' then
    raise exception 'Invalid rate payload';
  end if;
  insert into public.exchange_rates (currency_code, rate_date, units_per_usd, provider)
  select r ->> 'currency_code',
         (r ->> 'rate_date')::date,
         (r ->> 'units_per_usd')::numeric,
         btrim(p_provider)
  from jsonb_array_elements(p_rates) as r
  where jsonb_typeof(r -> 'units_per_usd') = 'number'
    and (r ->> 'units_per_usd')::numeric > 0
    and (r ->> 'units_per_usd')::numeric < 1000000000000
    and (r ->> 'rate_date') ~ '^\d{4}-\d{2}-\d{2}$'
    and exists (select 1 from public.currencies c where c.code = r ->> 'currency_code')
  on conflict (currency_code, rate_date) do update
    set units_per_usd = excluded.units_per_usd,
        provider = excluded.provider,
        fetched_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.cache_exchange_rates(text, jsonb) from public, anon;
grant execute on function public.cache_exchange_rates(text, jsonb) to authenticated;

commit;
