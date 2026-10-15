-- Prevent approved expenses from making an account balance negative.
-- This is enforced in PostgreSQL so UI checks cannot be bypassed and pending
-- company expenses are checked again when an owner/admin approves them.
begin;

create function private.guard_account_overdraft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opening numeric;
  v_available numeric;
begin
  -- prepare_transaction runs before this trigger and normalizes the final
  -- status (including company expenses that require approval).
  if new.status <> 'approved' or new.type <> 'expense' then
    return new;
  end if;

  -- prepare_transaction locks the workspace first, serializing transaction
  -- writes for that workspace. Lock the account too, then calculate in the
  -- account's native currency rather than the workspace reporting currency.
  select a.opening_balance
    into v_opening
    from public.accounts a
   where a.id = new.account_id
     and a.workspace_id = new.workspace_id
   for update;

  if v_opening is null then
    raise exception 'Choose a valid account in this workspace';
  end if;

  select v_opening + coalesce(sum(
    case when t.type = 'income' then t.amount else -t.amount end
  ), 0)
    into v_available
    from public.transactions t
   where t.workspace_id = new.workspace_id
     and t.account_id = new.account_id
     and t.status = 'approved'
     and t.id is distinct from new.id;

  if new.amount > v_available then
    raise exception 'Insufficient funds. Available balance: %', v_available;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_account_overdraft() from public, anon, authenticated;
create trigger transactions_z_account_overdraft_guard
before insert or update on public.transactions
for each row execute function private.guard_account_overdraft();

commit;
