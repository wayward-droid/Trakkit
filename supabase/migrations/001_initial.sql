-- Trakkit • initial schema adapted from the supplied v3 PRD.
-- Fresh Supabase project only. Run the entire file.

-- Fresh project migration: continue through section 11 before COMMIT.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  symbol text not null,
  decimals smallint not null default 2 check (decimals between 0 and 4)
);
alter table public.currencies enable row level security;
revoke all on public.currencies from anon, authenticated;
insert into public.currencies (code, name, symbol, decimals) values
  ('USD', 'US dollar', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'Pound sterling', '£', 2),
  ('NGN', 'Nigerian naira', '₦', 2),
  ('GHS', 'Ghanaian cedi', 'GH₵', 2),
  ('KES', 'Kenyan shilling', 'KSh', 2),
  ('ZAR', 'South African rand', 'R', 2),
  ('CAD', 'Canadian dollar', '$', 2),
  ('AED', 'UAE dirham', 'AED', 2),
  ('INR', 'Indian rupee', '₹', 2),
  ('CNY', 'Chinese yuan', '¥', 2),
  ('JPY', 'Japanese yen', '¥', 0);
create table public.exchange_rates (
  currency_code text not null references public.currencies(code),
  rate_date date not null,
  units_per_usd numeric(20,8) not null check (units_per_usd > 0 and units_per_usd < 1000000000000),
  provider text not null default 'exchangerate-api-open',
  fetched_at timestamptz not null default now(),
  primary key (currency_code, rate_date)
);
alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  display_currency text references public.currencies(code),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null check (type in ('personal', 'family', 'company')),
  base_currency text not null references public.currencies(code),
  members_see_all boolean not null default true,
  requires_approval boolean not null default false,
  currency_locked boolean not null default false,
  time_zone text not null default 'UTC',
  check (requires_approval = (type = 'company')),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon, authenticated;
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'accountant', 'member', 'viewer')),
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
alter table public.workspace_members enable row level security;
revoke all on public.workspace_members from anon, authenticated;
create index workspace_members_user_idx on public.workspace_members (user_id);
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'accountant', 'member', 'viewer')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from anon, authenticated;
-- Only policies call this private helper. It always checks the caller's ID.
create function private.workspace_role(p_ws uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m
  where m.workspace_id = p_ws and m.user_id = (select auth.uid());
$$;
revoke all on function private.workspace_role(uuid)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.workspace_role(uuid) to authenticated;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  type text not null check (type in ('cash', 'bank', 'card', 'wallet')),
  currency_code text not null references public.currencies(code),
  opening_balance numeric not null default 0 check (abs(opening_balance) < 1000000000000),
  created_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);
alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  type text not null check (type in ('expense', 'income')),
  color text not null default '#6b7280',
  created_at timestamptz not null default now(),
  unique (workspace_id, name, type),
  unique (id, workspace_id, type)
);
alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null,
  category_id uuid not null,
  created_by uuid not null default auth.uid(),
  type text not null check (type in ('expense', 'income')),
  amount numeric not null check (amount > 0 and amount < 1000000000000),
  currency_code text not null references public.currencies(code),
  exchange_rate numeric(20,8) not null
    check (exchange_rate > 0 and exchange_rate < 1000000000000),
  rate_source text not null default 'auto' check (rate_source in ('auto', 'manual')),
  amount_base numeric not null check (amount_base >= 0 and amount_base < 1e24),
  rate_date date,
  note text check (char_length(note) <= 200),
  payment_method text,
  transaction_date date not null default current_date,
  status text not null default 'approved' check (status in ('submitted', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  foreign key (account_id, workspace_id)
    references public.accounts(id, workspace_id)
    on delete no action deferrable initially immediate,
  foreign key (category_id, workspace_id, type)
    references public.categories(id, workspace_id, type)
    on delete no action deferrable initially immediate
);
alter table public.transactions enable row level security;
revoke all on public.transactions from anon, authenticated;
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid not null,
  category_type text not null default 'expense' check (category_type = 'expense'),
  month date not null check (month = date_trunc('month', month)::date),
  amount numeric not null check (amount > 0 and amount < 1000000000000),
  unique (workspace_id, category_id, month),
  foreign key (category_id, workspace_id, category_type)
    references public.categories(id, workspace_id, type)
    on delete no action deferrable initially immediate
);
alter table public.budgets enable row level security;
revoke all on public.budgets from anon, authenticated;
-- App users cannot edit audit rows. Workspace deletion removes its log.
create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
create index transactions_ws_date_idx on public.transactions (workspace_id, transaction_date desc);
create index transactions_ws_category_idx on public.transactions (workspace_id, category_id);
create index transactions_ws_status_idx on public.transactions (workspace_id, status);
create index transactions_ws_creator_idx on public.transactions (workspace_id, created_by);
create index audit_log_ws_time_idx on public.audit_log (workspace_id, created_at desc);

-- One quote routine is shared by the form preview and the save trigger.
create function public.quote_transaction(
  p_workspace uuid, p_account uuid, p_amount numeric,
  p_date date, p_manual_rate numeric default null
) returns jsonb language plpgsql stable security invoker
set search_path = '' as $$
declare
  v_base text; v_currency text; v_zone text;
  v_scale int; v_base_scale int; v_rate numeric(20,8); v_date date;
begin
  select w.base_currency, w.time_zone into v_base, v_zone
  from public.workspaces w where w.id = p_workspace;
  select a.currency_code, c.decimals into v_currency, v_scale
  from public.accounts a join public.currencies c on c.code = a.currency_code
  where a.id = p_account and a.workspace_id = p_workspace;
  if v_base is null or v_currency is null then
    raise exception 'Workspace or account is unavailable';
  end if;
  if p_date is null or p_date > (now() at time zone v_zone)::date then
    raise exception 'Choose today or an earlier transaction date';
  end if;
  if p_amount is null or not (p_amount > 0 and p_amount < 1e12)
     or p_amount <> round(p_amount, v_scale) then
    raise exception 'Invalid amount or currency precision';
  end if;
  select c.decimals into v_base_scale
  from public.currencies c where c.code = v_base;
  if v_currency = v_base then
    v_rate := 1; v_date := p_date;
  elsif p_manual_rate is not null then
    if not (p_manual_rate > 0 and p_manual_rate < 1e12) then
      raise exception 'Enter a positive manual rate';
    end if;
    v_rate := p_manual_rate; v_date := null;
  else
    -- Both sides use the same provider date. Never use a future rate.
    select round(b.units_per_usd / a.units_per_usd, 8), a.rate_date
    into v_rate, v_date
    from public.exchange_rates a join public.exchange_rates b
      on b.rate_date = a.rate_date and b.provider = a.provider
    where a.currency_code = v_currency and b.currency_code = v_base
      and a.rate_date <= p_date
    order by a.rate_date desc limit 1;
  end if;
  if v_rate is null or v_rate <= 0 then
    raise exception 'No usable rate for this date; enter a manual rate';
  end if;
  return jsonb_build_object(
    'currency_code', v_currency, 'base_currency', v_base,
    'exchange_rate', v_rate::text, 'rate_date', v_date,
    'rate_source', case when p_manual_rate is not null
      and v_currency <> v_base then 'manual' else 'auto' end,
    'amount_base', round(p_amount * v_rate, v_base_scale)::text,
    'stale', coalesce(p_date - v_date > 3, false));
end;
$$;
create function private.prepare_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  w public.workspaces; v_role text; q jsonb;
  v_financial boolean := false; v_status_change boolean := false;
  v_precision int; v_base_precision int;
begin
  select * into w from public.workspaces where id = new.workspace_id
  for update;
  v_role := private.workspace_role(new.workspace_id);
  if coalesce(v_role, '') not in ('owner','admin','accountant','member') then
    raise exception 'This role cannot change transactions';
  end if;
  if w.type = 'company' and v_role = 'member' and new.type <> 'expense' then
    raise exception 'Company members submit expenses only';
  end if;
  if tg_op = 'UPDATE' then
    if row(new.id, new.workspace_id, new.created_by, new.created_at, new.type)
       is distinct from row(old.id, old.workspace_id, old.created_by, old.created_at, old.type) then
      raise exception 'Transaction identity cannot change';
    end if;
    if v_role = 'member' and (old.created_by <> auth.uid()
       or (w.requires_approval and old.status = 'approved')) then
      raise exception 'This transaction cannot be edited by a member';
    end if;
    v_financial := row(new.amount,new.account_id,new.category_id,new.type,
      new.transaction_date,new.rate_source,new.exchange_rate,new.payment_method)
      is distinct from row(old.amount,old.account_id,old.category_id,old.type,
      old.transaction_date,old.rate_source,old.exchange_rate,old.payment_method);
    v_status_change := new.status is distinct from old.status;
    if v_status_change and v_financial then
      raise exception 'Save changes before reviewing or resubmitting';
    end if;
  end if;
  if not exists (select 1 from public.categories c
    where c.id = new.category_id and c.workspace_id = new.workspace_id
      and c.type = new.type) then
    raise exception 'Choose a matching category in this workspace';
  end if;
  -- Note, category, approval and amount-only edits reuse the stored rate.
  if tg_op = 'UPDATE' and new.account_id = old.account_id
     and new.transaction_date = old.transaction_date
     and new.rate_source = old.rate_source
     and new.exchange_rate is not distinct from old.exchange_rate then
    select c.decimals into v_precision from public.currencies c
      where c.code = old.currency_code;
    select c.decimals into v_base_precision from public.currencies c
      where c.code = w.base_currency;
    if new.amount <> round(new.amount, v_precision) then
      raise exception 'Too many decimal places for this currency';
    end if;
    new.currency_code := old.currency_code;
    new.exchange_rate := old.exchange_rate;
    new.rate_source := old.rate_source;
    new.rate_date := old.rate_date;
    new.amount_base := round(new.amount * old.exchange_rate, v_base_precision);
  else
    if new.rate_source = 'manual' and new.exchange_rate is null then
      raise exception 'A manual rate is required';
    end if;
    q := public.quote_transaction(new.workspace_id,new.account_id,new.amount,
      new.transaction_date,case when new.rate_source = 'manual'
        then new.exchange_rate else null end);
    new.currency_code := q ->> 'currency_code';
    new.exchange_rate := (q ->> 'exchange_rate')::numeric;
    new.rate_source := q ->> 'rate_source';
    new.rate_date := (q ->> 'rate_date')::date;
    new.amount_base := (q ->> 'amount_base')::numeric;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now(); new.revision := 1;
    new.status := case when w.requires_approval and new.type = 'expense'
      and v_role not in ('owner','admin') then 'submitted' else 'approved' end;
    new.reviewed_by := null; new.reviewed_at := null; new.reject_reason := null;
  else
    if not v_status_change and
      row(new.reviewed_by,new.reviewed_at,new.reject_reason) is distinct from
      row(old.reviewed_by,old.reviewed_at,old.reject_reason) then
      raise exception 'Review fields change only during a review';
    end if;
    if v_status_change then
      if not w.requires_approval or new.type <> 'expense' then
        raise exception 'This transaction has no approval workflow';
      end if;
      if old.status = 'submitted' and new.status in ('approved','rejected') then
        if v_role not in ('owner','admin') then
          raise exception 'Only an owner or admin can review';
        end if;
        if new.status = 'rejected' and btrim(coalesce(new.reject_reason,'')) = '' then
          raise exception 'A rejection needs a reason';
        end if;
        new.reject_reason := case when new.status = 'rejected'
          then btrim(new.reject_reason) else null end;
        new.reviewed_by := auth.uid(); new.reviewed_at := now();
      elsif old.status = 'rejected' and new.status = 'submitted' then
        new.reviewed_by := null; new.reviewed_at := null; new.reject_reason := null;
      else
        raise exception 'Invalid approval transition';
      end if;
    elsif v_financial and old.status = 'approved'
      and w.requires_approval and new.type = 'expense' then
      new.status := 'submitted';
      new.reviewed_by := null; new.reviewed_at := null; new.reject_reason := null;
    end if;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  update public.workspaces set currency_locked = true
    where id = w.id and not currency_locked;
  return new;
end;
$$;
create trigger transactions_prepare before insert or update on public.transactions
for each row execute function private.prepare_transaction();
create function private.write_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_ws uuid; v_action text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  v_ws := case when tg_table_name = 'workspaces' then (v_row->>'id')::uuid
    else (v_row->>'workspace_id')::uuid end;
  if not exists (select 1 from public.workspaces
    where id = v_ws and type = 'company') then return null; end if;
  v_action := lower(tg_op);
  if tg_op = 'UPDATE' and tg_table_name = 'transactions'
    and v_new->>'status' is distinct from v_old->>'status' then
    v_action := 'status_' || (v_new->>'status');
  elsif tg_op = 'UPDATE' and tg_table_name = 'workspace_members'
    and v_new->>'role' is distinct from v_old->>'role' then
    v_action := 'role_change';
  end if;
  insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
  values(v_ws,auth.uid(),v_action,tg_table_name,(v_row->>'id')::uuid,
    jsonb_build_object('old',v_old - 'token','new',v_new - 'token'));
  return null;
end;
$$;
do $$ declare t text; begin
  foreach t in array array['workspaces','workspace_members','workspace_invitations',
    'transactions','budgets','categories','accounts'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.write_audit()', 'audit_' || t, t);
  end loop;
end $$;

create or replace function private.seed_workspace(p_ws uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_base text;
begin
  select base_currency into v_base from public.workspaces where id = p_ws;
  insert into public.categories (workspace_id, name, type, color) values
    (p_ws, 'Food', 'expense', '#ef4444'),
    (p_ws, 'Transport', 'expense', '#f97316'),
    (p_ws, 'Rent', 'expense', '#8b5cf6'),
    (p_ws, 'Utilities', 'expense', '#06b6d4'),
    (p_ws, 'Health', 'expense', '#10b981'),
    (p_ws, 'Shopping', 'expense', '#ec4899'),
    (p_ws, 'Entertainment', 'expense', '#eab308'),
    (p_ws, 'Other', 'expense', '#6b7280'),
    (p_ws, 'Salary', 'income', '#22c55e'),
    (p_ws, 'Freelance', 'income', '#10b981'),
    (p_ws, 'Business income', 'income', '#14b8a6'),
    (p_ws, 'Sales', 'income', '#06b6d4'),
    (p_ws, 'Commission', 'income', '#0d9488'),
    (p_ws, 'Bonus', 'income', '#84cc16'),
    (p_ws, 'Investment returns', 'income', '#6366f1'),
    (p_ws, 'Interest', 'income', '#8b5cf6'),
    (p_ws, 'Rental income', 'income', '#a855f7'),
    (p_ws, 'Gifts', 'income', '#ec4899'),
    (p_ws, 'Refunds', 'income', '#f97316'),
    (p_ws, 'Pension', 'income', '#64748b'),
    (p_ws, 'Benefits', 'income', '#eab308'),
    (p_ws, 'Royalties', 'income', '#d946ef'),
    (p_ws, 'Grants', 'income', '#3b82f6'),
    (p_ws, 'Cashback', 'income', '#f59e0b'),
    (p_ws, 'Other income', 'income', '#14b8a6');
  insert into public.accounts (workspace_id, name, type, currency_code)
  values (p_ws, 'Cash', 'cash', v_base);
end;
$$;
revoke execute on function private.seed_workspace(uuid) from public, anon, authenticated;
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_currency text; v_zone text;
begin
  insert into public.profiles(id,display_name) values(new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),
      split_part(new.email,'@',1),'User'),80));
  select code into v_currency from public.currencies
    where code = new.raw_user_meta_data->>'base_currency';
  select name into v_zone from pg_catalog.pg_timezone_names
    where name = new.raw_user_meta_data->>'time_zone';
  insert into public.workspaces(name,type,base_currency,time_zone,created_by)
  values('Personal','personal',coalesce(v_currency,'NGN'),coalesce(v_zone,'UTC'),new.id)
  returning id into v_ws;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_ws,new.id,'owner');
  perform private.seed_workspace(v_ws);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();
create function public.create_workspace(
  p_name text, p_type text, p_base_currency text, p_time_zone text default 'UTC'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_type is null or p_type not in ('family','company') then
    raise exception 'Choose family or company';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Invalid time zone';
  end if;
  insert into public.workspaces(name,type,base_currency,time_zone,created_by,
    members_see_all,requires_approval)
  values(btrim(p_name),p_type,p_base_currency,p_time_zone,auth.uid(),
    p_type = 'family',p_type = 'company') returning id into v_ws;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_ws,auth.uid(),'owner');
  perform private.seed_workspace(v_ws);
  return v_ws;
end;
$$;
create function public.create_invitation(p_workspace uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare w public.workspaces; v_token uuid;
begin
  select * into w from public.workspaces where id = p_workspace for update;
  if coalesce(private.workspace_role(p_workspace),'') not in ('owner','admin')
    or w.type = 'personal' then raise exception 'Invitations are not allowed'; end if;
  if p_role is null or p_role not in ('admin','accountant','member','viewer')
    or (p_role = 'accountant' and w.type <> 'company') then
    raise exception 'Invalid role for this workspace';
  end if;
  if p_email is null or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  insert into public.workspace_invitations(workspace_id,email,role,invited_by)
  values(p_workspace,lower(btrim(p_email)),p_role,auth.uid()) returning token into v_token;
  return v_token;
end;
$$;
create function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.workspace_invitations; v_ws uuid; v_email text; v_type text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select lower(u.email) into v_email from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirm your email first'; end if;
  select workspace_id into v_ws from public.workspace_invitations where token = p_token;
  select type into v_type from public.workspaces where id = v_ws for update;
  select * into v_inv from public.workspace_invitations where token = p_token for update;
  if not found or v_inv.accepted_at is not null or v_inv.expires_at <= now()
    or v_type is null or v_type = 'personal' then
    raise exception 'Invitation is invalid or expired';
  end if;
  if v_email is distinct from v_inv.email then
    raise exception 'Sign in with the invited email address';
  end if;
  if coalesce((select role from public.workspace_members
    where workspace_id = v_ws and user_id = v_inv.invited_by),'')
    not in ('owner','admin') then raise exception 'Invitation was withdrawn'; end if;
  if v_inv.role = 'accountant' and v_type <> 'company' then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.workspace_members
    where workspace_id = v_ws and user_id = auth.uid()) then
    raise exception 'You already belong to this workspace';
  end if;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_ws,auth.uid(),v_inv.role);
  update public.workspace_invitations set accepted_at = now() where id = v_inv.id;
  return v_ws;
end;
$$;
create function public.transfer_ownership(p_workspace uuid,p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  select type into v_type from public.workspaces where id = p_workspace for update;
  if coalesce(private.workspace_role(p_workspace),'') <> 'owner'
    or v_type = 'personal' or p_new_owner is not distinct from auth.uid() then
    raise exception 'Ownership cannot be transferred';
  end if;
  update public.workspace_members set role = 'owner'
    where workspace_id = p_workspace and user_id = p_new_owner;
  if not found then raise exception 'Choose an existing member'; end if;
  update public.workspace_members set role = 'admin'
    where workspace_id = p_workspace and user_id = auth.uid();
end;
$$;

-- Guards run for API requests, RPCs and cascades.
create function private.guard_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
      raise exception 'Invalid time zone';
    end if;
    return new;
  end if;
  if row(new.id,new.type,new.created_by,new.created_at,new.requires_approval,new.time_zone)
    is distinct from row(old.id,old.type,old.created_by,old.created_at,
      old.requires_approval,old.time_zone) then
    raise exception 'Workspace identity and accounting settings are fixed';
  end if;
  if old.currency_locked and (not new.currency_locked
    or new.base_currency <> old.base_currency) then
    raise exception 'The base currency is permanently locked';
  end if;
  return new;
end;
$$;
create trigger workspace_guard before insert or update on public.workspaces
for each row execute function private.guard_workspace();
create function private.guard_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_type text; v_total int;
begin
  if tg_op = 'DELETE' then v_ws := old.workspace_id; else v_ws := new.workspace_id; end if;
  -- Serialize all membership changes in a workspace, including concurrent owner exits.
  select type into v_type from public.workspaces where id = v_ws for update;
  if v_type is null and tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and row(new.id,new.workspace_id,new.user_id,new.joined_at)
    is distinct from row(old.id,old.workspace_id,old.user_id,old.joined_at) then
    raise exception 'A membership cannot be moved';
  end if;
  if tg_op <> 'DELETE' and new.role = 'accountant' and v_type <> 'company' then
    raise exception 'Accountant is a company role';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_total from public.workspace_members where workspace_id = v_ws;
    if v_total >= 20 or (v_type = 'personal' and (v_total > 0 or new.role <> 'owner')) then
      raise exception 'Workspace member limit reached';
    end if;
  elsif old.role = 'owner' then
    if tg_op = 'DELETE' or new.role <> 'owner' then
      if v_type = 'personal' or not exists (select 1 from public.workspace_members
        where workspace_id = v_ws and role = 'owner' and id <> old.id) then
        raise exception 'Keep at least one owner';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger member_guard before insert or update or delete on public.workspace_members
for each row execute function private.guard_member();
create function private.guard_money_setup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_scale int; v_currency text;
begin
  perform 1 from public.workspaces where id = new.workspace_id for update;
  if tg_op = 'UPDATE' and row(new.id,new.workspace_id)
    is distinct from row(old.id,old.workspace_id) then
    raise exception 'This record cannot move to another workspace';
  end if;
  if tg_table_name = 'accounts' then
    if tg_op = 'UPDATE' and new.currency_code <> old.currency_code then
      raise exception 'Create a new account to use a different currency';
    end if;
    if tg_op = 'UPDATE' and new.opening_balance <> old.opening_balance
      and exists (select 1 from public.transactions where account_id = old.id) then
      raise exception 'Opening balance is locked while transactions exist';
    end if;
    select decimals into v_scale from public.currencies where code = new.currency_code;
    if new.opening_balance <> round(new.opening_balance,v_scale) then
      raise exception 'Invalid opening balance precision';
    end if;
    if new.opening_balance <> 0 then
      update public.workspaces set currency_locked = true
      where id = new.workspace_id and not currency_locked;
    end if;
  elsif tg_table_name = 'categories' then
    if tg_op = 'UPDATE' and new.type <> old.type then
      raise exception 'Category type cannot change';
    end if;
    if new.color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid colour'; end if;
  else
    select c.decimals into v_scale from public.workspaces w
      join public.currencies c on c.code = w.base_currency where w.id = new.workspace_id;
    if new.amount <> round(new.amount,v_scale) then raise exception 'Invalid budget precision'; end if;
    update public.workspaces set currency_locked = true
      where id = new.workspace_id and not currency_locked;
  end if;
  return new;
end;
$$;
do $$ declare t text; begin
  foreach t in array array['accounts','categories','budgets'] loop
    execute format('create trigger %I before insert or update on public.%I
      for each row execute function private.guard_money_setup()',t || '_guard',t);
  end loop;
end $$;
-- Text money columns preserve decimal values in JSON, forms and CSV exports.
create view public.transaction_details with (security_invoker = true) as
select t.id,t.workspace_id,t.account_id,t.category_id,t.created_by,t.type,
  t.amount::text as amount,t.currency_code,t.exchange_rate::text as exchange_rate,
  t.rate_source,t.rate_date,t.amount_base::text as amount_base,
  t.transaction_date,t.note,t.payment_method,t.status,t.reject_reason,
  t.reviewed_by,t.reviewed_at,t.created_at,t.updated_at,t.revision,
  a.name as account_name,c.name as category_name,c.color as category_color,
  coalesce(p.display_name,'Former member') as creator_name
from public.transactions t
join public.accounts a on a.id = t.account_id
join public.categories c on c.id = t.category_id
left join public.profiles p on p.id = t.created_by;
revoke all on public.transaction_details from anon,authenticated;
create function public.monthly_summary(p_workspace uuid,p_month date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb; v_base text; v_own boolean;
begin
  if p_month is null or p_month <> date_trunc('month',p_month)::date then
    raise exception 'Pass the first day of the month';
  end if;
  select base_currency,not members_see_all and private.workspace_role(id) = 'member'
    into v_base,v_own from public.workspaces where id = p_workspace;
  if v_base is null then raise exception 'Workspace unavailable'; end if;
  with rows as (
    select t.type,t.amount_base,t.category_id,c.name
    from public.transactions t join public.categories c on c.id = t.category_id
    where t.workspace_id = p_workspace and t.status = 'approved'
      and t.transaction_date >= p_month
      and t.transaction_date < (p_month + interval '1 month')::date
  ), totals as (
    select coalesce(sum(amount_base) filter(where type='income'),0) as income,
      coalesce(sum(amount_base) filter(where type='expense'),0) as expense from rows
  ), groups as (
    select category_id,name,sum(amount_base)::text as amount from rows
    where type = 'expense' group by category_id,name
  ) select jsonb_build_object('currency',v_base,'own_only',v_own,
    'income',income::text,'expense',expense::text,'net_change',(income-expense)::text,
    'categories',coalesce((select jsonb_agg(to_jsonb(g)) from groups g),'[]'::jsonb))
    into v_result from totals;
  return v_result;
end;
$$;

create policy profile_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
-- profiles: your own row, plus the names of people who share a workspace with you
create policy profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profile_comembers on public.profiles for select to authenticated
  using (exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = profiles.id and b.user_id = (select auth.uid())
  ));
-- workspaces: members read; only owners change; creation goes through create_workspace()
create policy ws_read on public.workspaces for select to authenticated
  using (private.workspace_role(id) is not null);
create policy ws_update on public.workspaces for update to authenticated
  using (private.workspace_role(id) = 'owner') with check (private.workspace_role(id) = 'owner');
create policy ws_delete on public.workspaces for delete to authenticated
  using (private.workspace_role(id) = 'owner' and type <> 'personal');
-- members: everyone in the workspace sees the list; owners and admins manage it
create policy members_read on public.workspace_members for select to authenticated
  using (private.workspace_role(workspace_id) is not null);
create policy members_update on public.workspace_members for update to authenticated
  using (private.workspace_role(workspace_id) = 'owner'
         or (private.workspace_role(workspace_id) = 'admin' and role <> 'owner'))
  with check (private.workspace_role(workspace_id) = 'owner'
         or (private.workspace_role(workspace_id) = 'admin' and role <> 'owner'));
create policy members_delete on public.workspace_members for delete to authenticated
  using (user_id = (select auth.uid())
         or private.workspace_role(workspace_id) = 'owner'
         or (private.workspace_role(workspace_id) = 'admin' and role <> 'owner'));
-- Invitations are created and accepted only through checked RPCs.
create policy invitation_read on public.workspace_invitations for select to authenticated
  using (private.workspace_role(workspace_id) in ('owner','admin'));
create policy invitation_revoke on public.workspace_invitations for delete to authenticated
  using (private.workspace_role(workspace_id) in ('owner','admin'));
-- reference data: readable by any signed-in user; no write policy, so only the service key can write
create policy currencies_read on public.currencies for select to authenticated using (true);
create policy rates_read on public.exchange_rates for select to authenticated using (true);
-- accounts, categories, budgets: everyone in the workspace reads; owner, admin and accountant write
do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'budgets'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.workspace_role(workspace_id) is not null)',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.workspace_role(workspace_id) in (''owner'', ''admin'', ''accountant'')) with check (private.workspace_role(workspace_id) in (''owner'', ''admin'', ''accountant''))',
      t || '_write', t);
  end loop;
end $$;
-- transactions
create policy tx_read on public.transactions for select to authenticated
  using (
    private.workspace_role(workspace_id) is not null
    and (
      private.workspace_role(workspace_id) <> 'member'
      or created_by = (select auth.uid())
      or exists (select 1 from public.workspaces w where w.id = workspace_id and w.members_see_all)
    )
  );
create policy tx_insert on public.transactions for insert to authenticated
  with check (private.workspace_role(workspace_id) in ('owner', 'admin', 'accountant', 'member'));
create policy tx_update on public.transactions for update to authenticated
  using (
    private.workspace_role(workspace_id) in ('owner', 'admin', 'accountant')
    or (
      private.workspace_role(workspace_id) = 'member'
      and created_by = (select auth.uid())
      and (status <> 'approved'
           or not exists (select 1 from public.workspaces w where w.id = workspace_id and w.requires_approval))
    )
  )
  with check (private.workspace_role(workspace_id) in ('owner', 'admin', 'accountant', 'member'));
create policy tx_delete on public.transactions for delete to authenticated
  using (
    private.workspace_role(workspace_id) in ('owner', 'admin', 'accountant')
    or (
      private.workspace_role(workspace_id) = 'member'
      and created_by = (select auth.uid())
      and (status <> 'approved'
           or not exists (select 1 from public.workspaces w where w.id = workspace_id and w.requires_approval))
    )
  );
-- audit log: read-only for owner, admin and accountant; the trigger writes it
create policy audit_read on public.audit_log for select to authenticated
  using (private.workspace_role(workspace_id) in ('owner', 'admin', 'accountant'));
revoke insert, update, delete on public.audit_log from authenticated, anon;
-- Explicit table and column privileges are part of authorization.
grant select on public.profiles, public.workspaces, public.workspace_members,
  public.workspace_invitations, public.currencies, public.exchange_rates,
  public.accounts, public.categories, public.transactions, public.budgets,
  public.audit_log, public.transaction_details to authenticated;
grant update(display_name,display_currency,theme) on public.profiles to authenticated;
grant update(name,base_currency,members_see_all) on public.workspaces to authenticated;
grant delete on public.workspaces to authenticated;
grant update(role) on public.workspace_members to authenticated;
grant delete on public.workspace_members,public.workspace_invitations to authenticated;
grant insert(workspace_id,name,type,currency_code,opening_balance)
  on public.accounts to authenticated;
grant update(name,type,opening_balance) on public.accounts to authenticated;
grant insert(workspace_id,name,type,color) on public.categories to authenticated;
grant update(name,color) on public.categories to authenticated;
grant insert(workspace_id,category_id,month,amount) on public.budgets to authenticated;
grant update(category_id,month,amount) on public.budgets to authenticated;
grant delete on public.accounts,public.categories,public.budgets to authenticated;
grant insert(id,workspace_id,account_id,category_id,type,amount,rate_source,
  exchange_rate,note,payment_method,transaction_date) on public.transactions to authenticated;
grant update(account_id,category_id,type,amount,rate_source,exchange_rate,
  note,payment_method,transaction_date,status,reject_reason)
  on public.transactions to authenticated;
grant delete on public.transactions to authenticated;
grant select on public.currencies to service_role;
grant select,insert on public.exchange_rates to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.workspace_role(uuid) to authenticated;
revoke all on function public.quote_transaction(uuid,uuid,numeric,date,numeric),
  public.create_workspace(text,text,text,text),public.create_invitation(uuid,text,text),
  public.accept_invitation(uuid),public.transfer_ownership(uuid,uuid),
  public.monthly_summary(uuid,date) from public,anon,authenticated;
grant execute on function public.quote_transaction(uuid,uuid,numeric,date,numeric),
  public.create_workspace(text,text,text,text),public.create_invitation(uuid,text,text),
  public.accept_invitation(uuid),public.transfer_ownership(uuid,uuid),
  public.monthly_summary(uuid,date) to authenticated;
commit;
