-- ---------- code sequences -------------------------------------------------
create sequence if not exists public.owner_code_seq;
create sequence if not exists public.ownership_contract_seq;

create or replace function public.next_owner_code()
returns text language sql volatile set search_path = public as $$
  select 'FT-O-' || lpad(nextval('public.owner_code_seq')::text, 5, '0')
$$;

create or replace function public.next_ownership_contract_number(_year int)
returns text language sql volatile set search_path = public as $$
  select 'FT-OC-' || _year::text || '-' || lpad(nextval('public.ownership_contract_seq')::text, 5, '0')
$$;

revoke all on function public.next_owner_code() from public, anon;
revoke all on function public.next_ownership_contract_number(int) from public, anon;

-- ---------- issue an ownership contract ------------------------------------
create or replace function public.admin_issue_ownership(
  _user_id uuid,
  _resort_id uuid,
  _kind entitlement_kind,
  _units numeric,
  _start_date date default current_date,
  _purchase_price numeric default 0,
  _maintenance_fee numeric default 0,
  _term_years int default null,
  _week_number int default null,
  _season text default null,
  _week_nights int default 7,
  _is_floating boolean default false,
  _resort_unit_id uuid default null,
  _share_fraction numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_contract_id uuid;
  v_entitlement_id uuid;
  v_year int;
begin
  if not (public.has_role(auth.uid(), 'ADMIN_STAFF') or public.has_role(auth.uid(), 'SUPER_ADMIN')) then
    raise exception 'Not authorised';
  end if;
  if _units is null or _units <= 0 then
    raise exception 'Allocation must be greater than zero';
  end if;
  if _resort_id is not null and not exists (select 1 from public.resorts where id = _resort_id) then
    raise exception 'Resort not found';
  end if;

  v_year := extract(year from _start_date)::int;

  select id into v_owner_id from public.owners where user_id = _user_id;
  if v_owner_id is null then
    insert into public.owners (user_id, owner_code, status)
    values (_user_id, public.next_owner_code(), 'active')
    returning id into v_owner_id;
  else
    update public.owners set status = 'active', updated_at = now() where id = v_owner_id;
  end if;

  insert into public.user_roles (user_id, role)
  values (_user_id, 'OWNER')
  on conflict (user_id, role) do nothing;

  insert into public.ownership_contracts
    (owner_id, contract_number, resort_id, status, start_date, end_date,
     purchase_price, maintenance_base_fee)
  values (
    v_owner_id, public.next_ownership_contract_number(v_year), _resort_id, 'active', _start_date,
    case when _term_years is null then null
         else (_start_date + (_term_years || ' years')::interval)::date end,
    coalesce(_purchase_price, 0), coalesce(_maintenance_fee, 0)
  )
  returning id into v_contract_id;

  if _kind = 'POINTS' then
    insert into public.ownership_points (contract_id, points_per_year, anniversary_month)
    values (v_contract_id, _units::int, extract(month from _start_date)::int);
  elsif _kind = 'WEEK' then
    insert into public.ownership_weeks (contract_id, week_number, season, nights, is_floating)
    values (v_contract_id, coalesce(_week_number, extract(week from _start_date)::int),
            _season, coalesce(_week_nights, 7), coalesce(_is_floating, false));
  end if;

  if _resort_unit_id is not null then
    insert into public.ownership_units (contract_id, resort_unit_id, share_fraction)
    values (v_contract_id, _resort_unit_id, coalesce(_share_fraction, 1));
  end if;

  insert into public.entitlements
    (owner_id, ownership_contract_id, kind, year, total_units, status, valid_from, valid_to)
  values (v_owner_id, v_contract_id, _kind, v_year, _units, 'available',
          _start_date, (_start_date + interval '1 year' - interval '1 day')::date)
  returning id into v_entitlement_id;

  if _kind = 'POINTS' then
    insert into public.points_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, _units, 'grant', auth.uid(), 'Opening ownership balance ' || v_year);
  else
    insert into public.entitlement_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, _units, 'grant', auth.uid(), 'Opening ownership balance ' || v_year);
  end if;

  if coalesce(_maintenance_fee, 0) > 0 then
    insert into public.maintenance_fees
      (owner_id, ownership_contract_id, year, amount, due_date, status)
    values (v_owner_id, v_contract_id, v_year, _maintenance_fee,
            (_start_date + interval '30 days')::date, 'pending');
  end if;

  return v_contract_id;
end;
$$;

revoke all on function public.admin_issue_ownership(uuid, uuid, entitlement_kind, numeric, date, numeric, numeric, int, int, text, int, boolean, uuid, numeric) from public, anon;
grant execute on function public.admin_issue_ownership(uuid, uuid, entitlement_kind, numeric, date, numeric, numeric, int, int, text, int, boolean, uuid, numeric) to authenticated, service_role;

-- ---------- renew an ownership year ----------------------------------------
create or replace function public.admin_renew_ownership(_contract_id uuid, _year int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.ownership_contracts%rowtype;
  v_prev public.entitlements%rowtype;
  v_entitlement_id uuid;
  v_units numeric;
  v_kind entitlement_kind;
begin
  if not (public.has_role(auth.uid(), 'ADMIN_STAFF') or public.has_role(auth.uid(), 'SUPER_ADMIN')) then
    raise exception 'Not authorised';
  end if;

  select * into v_contract from public.ownership_contracts where id = _contract_id;
  if not found then raise exception 'Ownership contract not found'; end if;

  if exists (select 1 from public.entitlements
             where ownership_contract_id = _contract_id and year = _year) then
    raise exception 'Entitlement for % already exists', _year;
  end if;

  select * into v_prev from public.entitlements
  where ownership_contract_id = _contract_id
  order by year desc limit 1;

  if found then
    v_kind := v_prev.kind;
    v_units := v_prev.total_units;
  else
    select 'POINTS'::entitlement_kind, points_per_year into v_kind, v_units
    from public.ownership_points where contract_id = _contract_id;
    if v_units is null then
      select 'WEEK'::entitlement_kind, count(*) into v_kind, v_units
      from public.ownership_weeks where contract_id = _contract_id;
    end if;
  end if;

  if v_units is null or v_units <= 0 then
    raise exception 'No allocation found for this contract';
  end if;

  insert into public.entitlements
    (owner_id, ownership_contract_id, kind, year, total_units, status, valid_from, valid_to)
  values (v_contract.owner_id, _contract_id, v_kind, _year, v_units, 'available',
          make_date(_year, 1, 1), make_date(_year, 12, 31))
  returning id into v_entitlement_id;

  if v_kind = 'POINTS' then
    insert into public.points_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, v_units, 'grant', auth.uid(), 'Ownership renewal ' || _year);
  else
    insert into public.entitlement_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, v_units, 'grant', auth.uid(), 'Ownership renewal ' || _year);
  end if;

  if coalesce(v_contract.maintenance_base_fee, 0) > 0 then
    insert into public.maintenance_fees
      (owner_id, ownership_contract_id, year, amount, due_date, status)
    values (v_contract.owner_id, _contract_id, _year, v_contract.maintenance_base_fee,
            make_date(_year, 3, 31), 'pending');
  end if;

  return v_entitlement_id;
end;
$$;

revoke all on function public.admin_renew_ownership(uuid, int) from public, anon;
grant execute on function public.admin_renew_ownership(uuid, int) to authenticated, service_role;

-- ---------- audit ownership contract changes -------------------------------
drop trigger if exists audit_ownership_contracts on public.ownership_contracts;
create trigger audit_ownership_contracts
after insert or update or delete on public.ownership_contracts
for each row execute function public.audit_row_change();