-- Revision-checked transaction operations and exact account balances.
begin;
create function public.update_transaction(
  p_workspace uuid, p_id uuid, p_revision integer, p_changes jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.transactions; w public.workspaces; r text; k text;
begin
  -- Lock in the same workspace -> transaction order as the write trigger.
  select * into w from public.workspaces where id = p_workspace for update;
  r := private.workspace_role(p_workspace);
  if coalesce(r,'') not in ('owner','admin','accountant','member') then
    raise exception 'Transaction unavailable';
  end if;
  select * into t from public.transactions where id = p_id and workspace_id = p_workspace for update;
  if not found or t.revision is distinct from p_revision then
    raise exception 'This transaction changed. Reload before editing';
  end if;
  if r = 'member' and (t.created_by <> auth.uid() or (w.requires_approval and t.status = 'approved')) then
    raise exception 'This transaction cannot be edited by a member';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'No changes supplied';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('account_id','category_id','amount','transaction_date','note','payment_method','rate_source','exchange_rate') then
      raise exception 'Invalid transaction field';
    end if;
  end loop;
  update public.transactions set
    account_id = case when p_changes ? 'account_id' then (p_changes->>'account_id')::uuid else t.account_id end,
    category_id = case when p_changes ? 'category_id' then (p_changes->>'category_id')::uuid else t.category_id end,
    amount = case when p_changes ? 'amount' then (p_changes->>'amount')::numeric else t.amount end,
    transaction_date = case when p_changes ? 'transaction_date' then (p_changes->>'transaction_date')::date else t.transaction_date end,
    note = case when p_changes ? 'note' then p_changes->>'note' else t.note end,
    payment_method = case when p_changes ? 'payment_method' then p_changes->>'payment_method' else t.payment_method end,
    rate_source = case when p_changes ? 'rate_source' then p_changes->>'rate_source' else t.rate_source end,
    exchange_rate = case when p_changes ? 'exchange_rate' then (p_changes->>'exchange_rate')::numeric else t.exchange_rate end
  where id = p_id and workspace_id = p_workspace;
  return p_id;
end;
$$;
create function public.delete_transaction(p_workspace uuid,p_id uuid,p_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.transactions; w public.workspaces; r text;
begin
  select * into w from public.workspaces where id = p_workspace for update;
  r := private.workspace_role(p_workspace);
  if coalesce(r,'') not in ('owner','admin','accountant','member') then raise exception 'Transaction unavailable'; end if;
  select * into t from public.transactions where id = p_id and workspace_id = p_workspace for update;
  if not found or t.revision is distinct from p_revision then raise exception 'This transaction changed. Reload before deleting'; end if;
  if r = 'member' and (t.created_by <> auth.uid() or (w.requires_approval and t.status = 'approved')) then
    raise exception 'This transaction cannot be deleted by a member';
  end if;
  delete from public.transactions where id = p_id and workspace_id = p_workspace;
  return p_id;
end;
$$;
-- The future approval UI uses this function. It cannot combine review with edits.
create function public.review_transaction(p_workspace uuid,p_id uuid,p_revision integer,p_status text,p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.transactions; r text;
begin
  perform 1 from public.workspaces where id = p_workspace for update;
  r := private.workspace_role(p_workspace);
  if coalesce(r,'') not in ('owner','admin','accountant','member') then raise exception 'Transaction unavailable'; end if;
  select * into t from public.transactions where id = p_id and workspace_id = p_workspace for update;
  if not found or t.revision is distinct from p_revision then raise exception 'This submission changed. Reload it'; end if;
  if r = 'member' and t.created_by <> auth.uid() then raise exception 'Transaction unavailable'; end if;
  if p_status in ('approved','rejected') and r not in ('owner','admin') then raise exception 'Only an owner or admin can review'; end if;
  if p_status is null or p_status not in ('approved','rejected','submitted') then raise exception 'Invalid review'; end if;
  if (p_status in ('approved','rejected') and t.status <> 'submitted')
    or (p_status = 'submitted' and t.status <> 'rejected') then
    raise exception 'Invalid approval transition';
  end if;
  update public.transactions set status = p_status, reject_reason = p_reason
  where id = p_id and workspace_id = p_workspace;
  return p_id;
end;
$$;
-- Table UPDATE column grants must also be revoked (table revocation alone is insufficient).
revoke update,delete on public.transactions from authenticated;
revoke update(account_id,category_id,type,amount,rate_source,exchange_rate,note,payment_method,transaction_date,status,reject_reason)
  on public.transactions from authenticated;
revoke all on function public.update_transaction(uuid,uuid,integer,jsonb),
  public.delete_transaction(uuid,uuid,integer),public.review_transaction(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.update_transaction(uuid,uuid,integer,jsonb),
  public.delete_transaction(uuid,uuid,integer),public.review_transaction(uuid,uuid,integer,text,text) to authenticated;
create view public.account_details with (security_invoker = true) as
  select id,workspace_id,name,type,currency_code,opening_balance::text as opening_balance,created_at from public.accounts;
revoke all on public.account_details from public,anon;
grant select on public.account_details to authenticated;
create function public.account_balances(p_workspace uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare own_only boolean; result jsonb;
begin
  select not members_see_all and private.workspace_role(id) = 'member' into own_only
    from public.workspaces where id = p_workspace;
  if own_only is null then raise exception 'Workspace unavailable'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into result from (
    select a.id,a.name,a.type,a.currency_code,
      case when own_only then null else a.opening_balance::text end as opening_balance,
      case when own_only then null else (a.opening_balance + coalesce((
        select sum(case when t.type = 'income' then t.amount else -t.amount end)
        from public.transactions t where t.account_id = a.id and t.workspace_id = p_workspace and t.status = 'approved'
      ),0))::text end as balance
    from public.accounts a where a.workspace_id = p_workspace order by a.created_at,a.id
  ) a;
  return jsonb_build_object('own_only',own_only,'accounts',result);
end;
$$;
revoke all on function public.account_balances(uuid) from public,anon;
grant execute on function public.account_balances(uuid) to authenticated;
commit;
