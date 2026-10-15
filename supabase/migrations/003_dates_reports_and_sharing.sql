-- Run after 001 and 002. Existing history is retained.
begin;

create function private.guard_transaction_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_today date; v_changed boolean;
begin
  select (statement_timestamp() at time zone w.time_zone)::date into v_today
    from public.workspaces w where w.id = new.workspace_id for update;
  if v_today is null then raise exception 'Workspace unavailable'; end if;
  if tg_op = 'INSERT' then
    if new.transaction_date is distinct from v_today then
      raise exception 'Income and expenses must be dated today in the workspace time zone. Backdating and future dates are not allowed';
    end if;
  else
    v_changed := row(new.amount,new.account_id,new.category_id,new.type,
      new.transaction_date,new.rate_source,new.exchange_rate,new.payment_method)
      is distinct from row(old.amount,old.account_id,old.category_id,old.type,
      old.transaction_date,old.rate_source,old.exchange_rate,old.payment_method);
    if old.transaction_date < v_today and v_changed then
      raise exception 'Past financial entries are locked. You can update the note or review the entry';
    end if;
    if new.transaction_date is distinct from old.transaction_date
      and new.transaction_date is distinct from v_today then
      raise exception 'Income and expenses must be dated today in the workspace time zone';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_transaction_date() from public,anon,authenticated;
create trigger transactions_date_guard before insert or update on public.transactions
  for each row execute function private.guard_transaction_date();

create function public.yearly_summary(p_workspace uuid,p_year integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_base text; v_own boolean; v_start date; v_result jsonb;
begin
  if p_year is null or p_year < 1900 or p_year > 9998 then raise exception 'Invalid year'; end if;
  v_start := make_date(p_year,1,1);
  select base_currency,not members_see_all and private.workspace_role(id) = 'member'
    into v_base,v_own from public.workspaces where id = p_workspace;
  if v_base is null then raise exception 'Workspace unavailable'; end if;
  select jsonb_build_object('year',p_year,'currency',v_base,'own_only',v_own,
    'income',coalesce(sum(amount_base) filter(where type='income'),0)::text,
    'expense',coalesce(sum(amount_base) filter(where type='expense'),0)::text,
    'net_change',coalesce(sum(case when type='income' then amount_base else -amount_base end),0)::text)
    into v_result from public.transactions
    where workspace_id = p_workspace and status = 'approved'
      and transaction_date >= v_start and transaction_date < (v_start + interval '1 year')::date;
  return v_result;
end;
$$;

create function public.report_exchange_rate(p_workspace uuid,p_currency text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_base text; v_today date; v_rate numeric; v_date date;
begin
  select base_currency,(statement_timestamp() at time zone time_zone)::date
    into v_base,v_today from public.workspaces where id = p_workspace;
  if v_base is null then raise exception 'Workspace unavailable'; end if;
  if not exists (select 1 from public.currencies where code = p_currency) then raise exception 'Invalid currency'; end if;
  if v_base = p_currency then
    return jsonb_build_object('rate','1','date',v_today,'source','base','stale',false);
  end if;
  select round(b.units_per_usd / a.units_per_usd,8),a.rate_date into v_rate,v_date
    from public.exchange_rates a join public.exchange_rates b
      on a.rate_date = b.rate_date and a.provider = b.provider
    where a.currency_code = v_base and b.currency_code = p_currency and a.rate_date <= v_today
    order by a.rate_date desc limit 1;
  if v_rate is null or v_rate <= 0 then raise exception 'No cached rate available. Enter a manual exchange rate'; end if;
  return jsonb_build_object('rate',v_rate::text,'date',v_date,'source','cached','stale',v_today-v_date>3);
end;
$$;

-- Serialize role changes and revocations with invitation acceptance.
create function public.manage_workspace_member(p_workspace uuid,p_user uuid,p_role text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_target text; v_type text;
begin
  select type into v_type from public.workspaces where id=p_workspace for update;
  v_role := private.workspace_role(p_workspace);
  select role into v_target from public.workspace_members where workspace_id=p_workspace and user_id=p_user;
  if v_type is null or v_type='personal' or v_target is null then raise exception 'Membership unavailable'; end if;
  if not (coalesce(v_role,'') in ('owner','admin') or (p_user=auth.uid() and p_role is null)) then
    raise exception 'Only an owner or admin can manage members';
  end if;
  if v_target='owner' then raise exception 'Transfer ownership before leaving or changing this member'; end if;
  if p_role is null then
    delete from public.workspace_members where workspace_id=p_workspace and user_id=p_user;
  else
    if p_role not in ('admin','accountant','member','viewer') or (p_role='accountant' and v_type<>'company') then
      raise exception 'Invalid role';
    end if;
    update public.workspace_members set role=p_role where workspace_id=p_workspace and user_id=p_user;
  end if;
end;
$$;

create function public.revoke_invitation(p_workspace uuid,p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  if coalesce(private.workspace_role(p_workspace),'') not in ('owner','admin') then raise exception 'Invitation unavailable'; end if;
  delete from public.workspace_invitations where workspace_id=p_workspace and id=p_id and accepted_at is null;
  if not found then raise exception 'Invitation already accepted or unavailable'; end if;
end;
$$;
revoke all on function public.yearly_summary(uuid,integer),public.report_exchange_rate(uuid,text),
  public.manage_workspace_member(uuid,uuid,text),public.revoke_invitation(uuid,uuid) from public,anon;
grant execute on function public.yearly_summary(uuid,integer),public.report_exchange_rate(uuid,text),
  public.manage_workspace_member(uuid,uuid,text),public.revoke_invitation(uuid,uuid) to authenticated;
commit;
