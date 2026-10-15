-- Trakkit planning features: budgets, savings goals, and recurring bills.
-- Uses the existing SECURITY DEFINER workspace_role helper because direct
-- access to workspace_members is intentionally revoked from authenticated users.
begin;

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

-- Workspace-scoped read/write access. The helper is SECURITY DEFINER and is
-- already granted to authenticated users by migration 001; querying
-- workspace_members directly here would fail because table access is revoked.
do $$
declare
  t text;
begin
  foreach t in array array['budgets','savings_goals','recurring_bills'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

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

commit;
