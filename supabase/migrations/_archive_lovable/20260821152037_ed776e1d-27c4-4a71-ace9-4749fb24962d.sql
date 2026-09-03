-- ---------- code sequences -------------------------------------------------
create sequence if not exists public.member_code_seq;
create sequence if not exists public.membership_contract_seq;

create or replace function public.next_member_code()
returns text language sql volatile set search_path = public as $$
  select 'FT-M-' || lpad(nextval('public.member_code_seq')::text, 5, '0')
$$;

create or replace function public.next_membership_contract_number(_year int)
returns text language sql volatile set search_path = public as $$
  select 'FT-C-' || _year::text || '-' || lpad(nextval('public.membership_contract_seq')::text, 5, '0')
$$;

revoke all on function public.next_member_code() from public, anon;
revoke all on function public.next_membership_contract_number(int) from public, anon;

-- ---------- entitlement balance -------------------------------------------
create or replace function public.entitlement_balance(_entitlement_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(delta) from public.entitlement_ledger where entitlement_id = _entitlement_id), 0)
       + coalesce((select sum(delta) from public.points_ledger where entitlement_id = _entitlement_id), 0)
$$;

revoke all on function public.entitlement_balance(uuid) from public, anon;
grant execute on function public.entitlement_balance(uuid) to authenticated, service_role;

-- ---------- issue a membership --------------------------------------------
create or replace function public.admin_issue_membership(
  _user_id uuid,
  _plan_id uuid,
  _start_date date default current_date,
  _price_paid numeric default null,
  _maintenance_fee numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans%rowtype;
  v_member_id uuid;
  v_contract_id uuid;
  v_entitlement_id uuid;
  v_year int;
  v_units numeric;
  v_kind entitlement_kind;
  v_fee numeric;
begin
  if not (public.has_role(auth.uid(), 'ADMIN_STAFF') or public.has_role(auth.uid(), 'SUPER_ADMIN')) then
    raise exception 'Not authorised';
  end if;

  select * into v_plan from public.membership_plans where id = _plan_id;
  if not found then raise exception 'Plan not found'; end if;
  if not v_plan.active then raise exception 'Plan is not active'; end if;

  v_year := extract(year from _start_date)::int;
  v_kind := v_plan.entitlement_kind;
  v_units := case when v_kind = 'POINTS' then coalesce(v_plan.points_per_year, 0)
                  else coalesce(v_plan.nights_per_year, 0) end;
  v_fee := coalesce(_maintenance_fee, v_plan.maintenance_base_fee);

  select id into v_member_id from public.members where user_id = _user_id;
  if v_member_id is null then
    insert into public.members (user_id, member_code, status, joined_at)
    values (_user_id, public.next_member_code(), 'active', _start_date)
    returning id into v_member_id;
  else
    update public.members set status = 'active', updated_at = now() where id = v_member_id;
  end if;

  insert into public.user_roles (user_id, role)
  values (_user_id, 'MEMBER')
  on conflict (user_id, role) do nothing;

  insert into public.membership_contracts
    (member_id, plan_id, contract_number, status, start_date, end_date, price_paid)
  values (
    v_member_id, _plan_id, public.next_membership_contract_number(v_year), 'active', _start_date,
    case when v_plan.term_years is null then null else (_start_date + (v_plan.term_years || ' years')::interval)::date end,
    coalesce(_price_paid, v_plan.price)
  )
  returning id into v_contract_id;

  insert into public.entitlements
    (member_id, membership_contract_id, kind, year, total_units, status, valid_from, valid_to)
  values (
    v_member_id, v_contract_id, v_kind, v_year, v_units, 'available',
    _start_date, (_start_date + interval '1 year' - interval '1 day')::date
  )
  returning id into v_entitlement_id;

  if v_kind = 'POINTS' then
    insert into public.points_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, v_units, 'grant', auth.uid(), 'Opening balance for ' || v_plan.name);
  else
    insert into public.entitlement_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, v_units, 'grant', auth.uid(), 'Opening balance for ' || v_plan.name);
  end if;

  insert into public.maintenance_fees
    (member_id, membership_contract_id, year, amount, due_date, status)
  values (v_member_id, v_contract_id, v_year, v_fee, (_start_date + interval '30 days')::date, 'pending');

  return v_contract_id;
end;
$$;

revoke all on function public.admin_issue_membership(uuid, uuid, date, numeric, numeric) from public, anon;
grant execute on function public.admin_issue_membership(uuid, uuid, date, numeric, numeric) to authenticated, service_role;

-- ---------- renew a membership year ---------------------------------------
create or replace function public.admin_renew_membership(_contract_id uuid, _year int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.membership_contracts%rowtype;
  v_plan public.membership_plans%rowtype;
  v_entitlement_id uuid;
  v_units numeric;
begin
  if not (public.has_role(auth.uid(), 'ADMIN_STAFF') or public.has_role(auth.uid(), 'SUPER_ADMIN')) then
    raise exception 'Not authorised';
  end if;

  select * into v_contract from public.membership_contracts where id = _contract_id;
  if not found then raise exception 'Contract not found'; end if;
  select * into v_plan from public.membership_plans where id = v_contract.plan_id;

  if exists (select 1 from public.entitlements
             where membership_contract_id = _contract_id and year = _year) then
    raise exception 'Entitlement for % already exists', _year;
  end if;

  v_units := case when v_plan.entitlement_kind = 'POINTS' then coalesce(v_plan.points_per_year, 0)
                  else coalesce(v_plan.nights_per_year, 0) end;

  insert into public.entitlements
    (member_id, membership_contract_id, kind, year, total_units, status, valid_from, valid_to)
  values (v_contract.member_id, _contract_id, v_plan.entitlement_kind, _year, v_units, 'available',
          make_date(_year, 1, 1), make_date(_year, 12, 31))
  returning id into v_entitlement_id;

  if v_plan.entitlement_kind = 'POINTS' then
    insert into public.points_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, v_units, 'grant', auth.uid(), 'Renewal ' || _year);
  else
    insert into public.entitlement_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (v_entitlement_id, v_units, 'grant', auth.uid(), 'Renewal ' || _year);
  end if;

  insert into public.maintenance_fees
    (member_id, membership_contract_id, year, amount, due_date, status)
  values (v_contract.member_id, _contract_id, _year, v_plan.maintenance_base_fee,
          make_date(_year, 3, 31), 'pending');

  return v_entitlement_id;
end;
$$;

revoke all on function public.admin_renew_membership(uuid, int) from public, anon;
grant execute on function public.admin_renew_membership(uuid, int) to authenticated, service_role;

-- ---------- manual entitlement adjustment ---------------------------------
create or replace function public.admin_adjust_entitlement(
  _entitlement_id uuid,
  _delta numeric,
  _reason text,
  _notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind entitlement_kind;
begin
  if not (public.has_role(auth.uid(), 'ADMIN_STAFF') or public.has_role(auth.uid(), 'SUPER_ADMIN')) then
    raise exception 'Not authorised';
  end if;
  if _delta = 0 then raise exception 'Delta must not be zero'; end if;

  select kind into v_kind from public.entitlements where id = _entitlement_id;
  if v_kind is null then raise exception 'Entitlement not found'; end if;

  if public.entitlement_balance(_entitlement_id) + _delta < 0 then
    raise exception 'Adjustment would take the balance below zero';
  end if;

  if v_kind = 'POINTS' then
    insert into public.points_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (_entitlement_id, _delta, coalesce(_reason, 'adjustment'), auth.uid(), _notes);
  else
    insert into public.entitlement_ledger (entitlement_id, delta, reason, actor_id, notes)
    values (_entitlement_id, _delta, coalesce(_reason, 'adjustment'), auth.uid(), _notes);
  end if;
end;
$$;

revoke all on function public.admin_adjust_entitlement(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_adjust_entitlement(uuid, numeric, text, text) to authenticated, service_role;

-- ---------- seed the published plans --------------------------------------
insert into public.membership_plans
  (code, name, tier, entitlement_kind, nights_per_year, points_per_year, booking_window_days,
   term_years, resort_scope, price, maintenance_base_fee, active, rules)
values
  ('SILVER', 'Silver Escape', 'Silver', 'NIGHTS', 7, null, 180, 10,
   '{"scope":"domestic"}'::jsonb, 295000, 18000, true,
   '{"min_stay":2,"max_stay":7,"guests_included":4,"cancellation":"standard"}'::jsonb),
  ('GOLD', 'Gold Retreat', 'Gold', 'NIGHTS', 14, null, 270, 15,
   '{"scope":"domestic+select-international"}'::jsonb, 545000, 26000, true,
   '{"min_stay":2,"max_stay":14,"guests_included":6,"cancellation":"standard"}'::jsonb),
  ('PLATINUM', 'Platinum Points', 'Platinum', 'POINTS', null, 30000, 365, 25,
   '{"scope":"global"}'::jsonb, 895000, 38000, true,
   '{"min_stay":1,"max_stay":21,"guests_included":6,"cancellation":"flexible"}'::jsonb),
  ('SIGNATURE', 'Signature Residence', 'Signature', 'POINTS', null, 60000, 365, null,
   '{"scope":"global+residences"}'::jsonb, 1750000, 62000, true,
   '{"min_stay":1,"max_stay":30,"guests_included":8,"cancellation":"flexible","concierge":true}'::jsonb)
on conflict (code) do nothing;

insert into public.membership_benefits (plan_id, label, detail, sort_order)
select p.id, b.label, b.detail, b.sort_order
from public.membership_plans p
join (values
  ('SILVER', 'Night-by-night getaways', '15 nights every membership year', 1),
  ('SILVER', 'Earn 1,200 credits per night stayed', 2),
  ('SILVER', '180-day booking window', '₹2,95,000 · ₹18,000 annual upkeep', 3),
  ('GOLD', '14 nights every year', 'One and two-bedroom suites, domestic plus select international', 1),
  ('GOLD', '9-month booking window', 'Reserve up to 270 days ahead for peak season', 2),
  ('GOLD', 'Split your stays', 'Use your nights across multiple trips each year', 3),
  ('PLATINUM', '30,000 points a year', 'Spend across seasons, room types and destinations', 1),
  ('PLATINUM', '12-month booking window', 'First access to festive and peak inventory', 2),
  ('PLATINUM', 'Exchange and rental access', 'Deposit unused points or list your week', 3),
  ('SIGNATURE', '60,000 points a year', 'Residence-grade inventory and private villas', 1),
  ('SIGNATURE', 'Perpetual membership', 'No fixed term — pass it on to your family', 2),
  ('SIGNATURE', 'Dedicated concierge', 'Personal holiday planner and in-resort host', 3)
) as b(code, label, detail, sort_order) on b.code = p.code
where not exists (
  select 1 from public.membership_benefits mb where mb.plan_id = p.id and mb.label = b.label
);