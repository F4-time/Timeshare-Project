
-- 1. New permissions ---------------------------------------------------------
insert into public.permissions (key, label, perm_group) values
  ('staff.write', 'Manage staff and roles', 'staff'),
  ('support.read', 'Read support tickets', 'support'),
  ('support.write', 'Work support tickets', 'support'),
  ('documents.read', 'Read all documents', 'documents')
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
select r.role_key, p.key
from (values ('ADMIN_STAFF'::app_role), ('SUPER_ADMIN'::app_role)) as r(role_key)
cross join (values ('staff.write'), ('support.read'), ('support.write'), ('documents.read')) as p(key)
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key) values
  ('RESORT_STAFF', 'support.read'),
  ('RESORT_STAFF', 'support.write')
on conflict do nothing;

-- 2. Guard helper -------------------------------------------------------------
create or replace function public.admin_guard(_perm text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin(auth.uid()) or public.has_permission(auth.uid(), _perm)) then
    raise exception 'Permission denied: %', _perm;
  end if;
end;
$$;

-- 3. Dashboard metrics --------------------------------------------------------
create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.admin_guard('members.read');
  select jsonb_build_object(
    'members', (select count(*) from public.members),
    'owners', (select count(*) from public.owners),
    'resorts', (select count(*) from public.resorts),
    'units', (select count(*) from public.resort_units),
    'bookings_today', (select count(*) from public.reservations where check_in = current_date),
    'upcoming_bookings', (select count(*) from public.reservations
       where check_in >= current_date and status in ('pending','confirmed')),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open','in_progress','waiting')),
    'active_listings', (select count(*) from public.rental_listings where status = 'listed'),
    'open_exchanges', (select count(*) from public.exchange_requests where status in ('requested','approved','matched')),
    'dues_outstanding', (select coalesce(sum(greatest(amount + coalesce(late_fee,0) - coalesce(amount_paid,0), 0)), 0)
       from public.maintenance_fees where status in ('pending','partial','overdue')),
    'captured_payments', (select coalesce(sum(amount), 0) from public.payments where status = 'captured'),
    'refunded_payments', (select coalesce(sum(amount), 0) from public.refunds where status in ('processed','completed'))
  ) into result;
  return result;
end;
$$;

-- 4. Member directory ---------------------------------------------------------
create or replace function public.admin_list_members(_term text default null)
returns table (
  member_id uuid,
  user_id uuid,
  member_code text,
  status account_status,
  joined_at timestamptz,
  full_name text,
  email text,
  phone text,
  kyc_verified_at timestamptz,
  contracts bigint,
  reservations bigint,
  dues numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('members.read');
  return query
  select m.id, m.user_id, m.member_code, m.status, m.joined_at,
         p.full_name, p.email, p.phone, m.kyc_verified_at,
         (select count(*) from public.membership_contracts mc where mc.member_id = m.id),
         (select count(*) from public.reservations r where r.member_id = m.id),
         (select coalesce(sum(greatest(f.amount + coalesce(f.late_fee,0) - coalesce(f.amount_paid,0),0)),0)
            from public.maintenance_fees f
           where f.member_id = m.id and f.status in ('pending','partial','overdue'))
  from public.members m
  left join public.profiles p on p.id = m.user_id
  where _term is null or _term = ''
     or m.member_code ilike '%'||_term||'%'
     or coalesce(p.full_name,'') ilike '%'||_term||'%'
     or coalesce(p.email,'') ilike '%'||_term||'%'
  order by m.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_set_member_status(_member_id uuid, _status account_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('members.write');
  update public.members set status = _status where id = _member_id;
end;
$$;

create or replace function public.admin_verify_member_kyc(_member_id uuid, _verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('members.write');
  update public.members
     set kyc_verified_at = case when _verified then now() else null end
   where id = _member_id;
end;
$$;

-- 5. Support desk --------------------------------------------------------------
create or replace function public.admin_list_tickets(_status ticket_status default null)
returns table (
  id uuid,
  subject text,
  body text,
  status ticket_status,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  requester_name text,
  requester_email text,
  assigned_to uuid,
  assignee_name text,
  resort_id uuid,
  resort_name text,
  message_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('support.read');
  return query
  select t.id, t.subject, t.body, t.status, t.created_at, t.updated_at,
         t.user_id, rp.full_name, rp.email,
         t.assigned_to, ap.full_name,
         t.resort_id, rs.name,
         (select count(*) from public.ticket_messages m where m.ticket_id = t.id)
  from public.support_tickets t
  left join public.profiles rp on rp.id = t.user_id
  left join public.profiles ap on ap.id = t.assigned_to
  left join public.resorts rs on rs.id = t.resort_id
  where _status is null or t.status = _status
  order by t.updated_at desc
  limit 200;
end;
$$;

create or replace function public.admin_ticket_messages(_ticket_id uuid)
returns table (id uuid, body text, created_at timestamptz, author_id uuid, author_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('support.read');
  return query
  select m.id, m.body, m.created_at, m.author_id, p.full_name
  from public.ticket_messages m
  left join public.profiles p on p.id = m.author_id
  where m.ticket_id = _ticket_id
  order by m.created_at asc;
end;
$$;

create or replace function public.admin_reply_ticket(_ticket_id uuid, _body text, _status ticket_status default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('support.write');
  insert into public.ticket_messages (ticket_id, author_id, body)
  values (_ticket_id, auth.uid(), _body);
  update public.support_tickets
     set status = coalesce(_status, case when status = 'open' then 'in_progress'::ticket_status else status end),
         updated_at = now()
   where id = _ticket_id;
end;
$$;

create or replace function public.admin_update_ticket(_ticket_id uuid, _status ticket_status default null, _assigned_to uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('support.write');
  update public.support_tickets
     set status = coalesce(_status, status),
         assigned_to = coalesce(_assigned_to, assigned_to),
         updated_at = now()
   where id = _ticket_id;
end;
$$;

-- 6. Staff & roles ---------------------------------------------------------------
create or replace function public.admin_list_staff()
returns table (
  staff_id uuid,
  user_id uuid,
  full_name text,
  email text,
  employee_code text,
  department text,
  title text,
  active boolean,
  roles text[],
  resorts jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('staff.read');
  return query
  select s.id, s.user_id, p.full_name, p.email, s.employee_code, s.department, s.title, s.active,
         coalesce((select array_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id = s.user_id), '{}'::text[]),
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
                     from public.staff_resorts sr join public.resorts r on r.id = sr.resort_id
                    where sr.staff_id = s.id), '[]'::jsonb)
  from public.staff s
  left join public.profiles p on p.id = s.user_id
  order by s.created_at desc;
end;
$$;

create or replace function public.admin_upsert_staff(
  _user_id uuid,
  _employee_code text default null,
  _department text default null,
  _title text default null,
  _active boolean default true,
  _resort_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  perform public.admin_guard('staff.write');
  insert into public.staff (user_id, employee_code, department, title, active)
  values (_user_id, _employee_code, _department, _title, coalesce(_active, true))
  on conflict (user_id) do update
     set employee_code = excluded.employee_code,
         department = excluded.department,
         title = excluded.title,
         active = excluded.active
  returning id into sid;

  if _resort_ids is not null then
    delete from public.staff_resorts where staff_id = sid;
    insert into public.staff_resorts (staff_id, resort_id)
    select sid, unnest(_resort_ids)
    on conflict do nothing;
  end if;

  return sid;
end;
$$;

create or replace function public.admin_grant_role(_user_id uuid, _role app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('staff.write');
  if _role in ('SUPER_ADMIN','ADMIN_STAFF') and not public.is_super_admin(auth.uid()) then
    raise exception 'Only a super admin may grant administrative roles';
  end if;
  insert into public.user_roles (user_id, role) values (_user_id, _role)
  on conflict (user_id, role) do nothing;
end;
$$;

create or replace function public.admin_revoke_role(_user_id uuid, _role app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('staff.write');
  if _role in ('SUPER_ADMIN','ADMIN_STAFF') and not public.is_super_admin(auth.uid()) then
    raise exception 'Only a super admin may revoke administrative roles';
  end if;
  if _role = 'SUPER_ADMIN' and _user_id = auth.uid() then
    raise exception 'You cannot revoke your own super admin role';
  end if;
  delete from public.user_roles where user_id = _user_id and role = _role;
end;
$$;

create or replace function public.admin_role_matrix()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.admin_guard('staff.read');
  select jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'label', r.label, 'description', r.description) order by r.key), '[]'::jsonb) from public.roles r),
    'permissions', (select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'label', p.label, 'group', p.perm_group) order by p.perm_group, p.key), '[]'::jsonb) from public.permissions p),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('role', rp.role_key, 'permission', rp.permission_key)), '[]'::jsonb) from public.role_permissions rp),
    'counts', (select coalesce(jsonb_object_agg(role::text, c), '{}'::jsonb) from (select role, count(*) c from public.user_roles group by role) x)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_set_role_permissions(_role app_role, _permission_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('staff.write');
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only a super admin may change the permission matrix';
  end if;
  delete from public.role_permissions where role_key = _role;
  insert into public.role_permissions (role_key, permission_key)
  select _role, k from unnest(coalesce(_permission_keys, '{}'::text[])) k
  where exists (select 1 from public.permissions p where p.key = k)
  on conflict do nothing;
end;
$$;

-- 7. Settings ---------------------------------------------------------------------
create or replace function public.admin_set_setting(_key text, _value jsonb, _description text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('settings.write');
  insert into public.system_settings (key, value, description)
  values (_key, _value, _description)
  on conflict (key) do update
     set value = excluded.value,
         description = coalesce(excluded.description, public.system_settings.description),
         updated_at = now();
end;
$$;

create or replace function public.admin_delete_setting(_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('settings.write');
  delete from public.system_settings where key = _key;
end;
$$;

-- 8. Documents ---------------------------------------------------------------------
create or replace function public.admin_list_documents(_term text default null)
returns table (
  id uuid,
  title text,
  kind document_kind,
  storage_path text,
  created_at timestamptz,
  owner_user_id uuid,
  owner_name text,
  owner_email text,
  related_table text,
  related_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('documents.read');
  return query
  select d.id, d.title, d.kind, d.storage_path, d.created_at,
         d.owner_user_id, p.full_name, p.email, d.related_table, d.related_id
  from public.documents d
  left join public.profiles p on p.id = d.owner_user_id
  where _term is null or _term = ''
     or d.title ilike '%'||_term||'%'
     or coalesce(p.full_name,'') ilike '%'||_term||'%'
     or coalesce(p.email,'') ilike '%'||_term||'%'
  order by d.created_at desc
  limit 200;
end;
$$;

-- 9. Rentals -------------------------------------------------------------------------
create or replace function public.admin_list_rentals()
returns table (
  listing_id uuid,
  owner_id uuid,
  owner_code text,
  owner_name text,
  resort_name text,
  start_date date,
  end_date date,
  asking_price numeric,
  commission_pct numeric,
  status listing_status,
  booking_id uuid,
  booking_amount numeric,
  owner_amount numeric,
  booking_status text,
  payout_id uuid,
  payout_status text,
  payout_amount numeric,
  payout_utr text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('owners.read');
  return query
  select l.id, l.owner_id, o.owner_code, p.full_name, r.name,
         l.start_date, l.end_date, l.asking_price, l.commission_pct, l.status,
         b.id, b.amount, b.owner_amount, b.status,
         po.id, po.status, po.amount, po.utr
  from public.rental_listings l
  join public.owners o on o.id = l.owner_id
  left join public.profiles p on p.id = o.user_id
  left join public.resorts r on r.id = l.resort_id
  left join public.rental_bookings b on b.listing_id = l.id
  left join public.rental_payouts po on po.rental_booking_id = b.id
  order by l.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_set_listing_status(_listing_id uuid, _status listing_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('owners.write');
  update public.rental_listings set status = _status, updated_at = now() where id = _listing_id;
end;
$$;

create or replace function public.admin_settle_payout(_payout_id uuid, _utr text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('finance.write');
  update public.rental_payouts
     set status = 'paid', utr = _utr, paid_at = now()
   where id = _payout_id;
end;
$$;

-- 10. Exchange ---------------------------------------------------------------------------
create or replace function public.admin_list_exchange()
returns table (
  id uuid,
  status exchange_status,
  created_at timestamptz,
  window_start date,
  window_end date,
  requested_resort text,
  party_name text,
  party_code text,
  entitlement_id uuid,
  entitlement_kind entitlement_kind
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('bookings.read');
  return query
  select x.id, x.status, x.created_at, x.window_start, x.window_end,
         r.name,
         coalesce(pm.full_name, po.full_name),
         coalesce(m.member_code, ow.owner_code),
         x.entitlement_id, e.kind
  from public.exchange_requests x
  left join public.resorts r on r.id = x.requested_resort_id
  left join public.members m on m.id = x.member_id
  left join public.profiles pm on pm.id = m.user_id
  left join public.owners ow on ow.id = x.owner_id
  left join public.profiles po on po.id = ow.user_id
  left join public.entitlements e on e.id = x.entitlement_id
  order by x.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_set_exchange_status(_request_id uuid, _status exchange_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard('bookings.override');
  update public.exchange_requests set status = _status, updated_at = now() where id = _request_id;
end;
$$;

-- 11. Execute grants ------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'admin_guard(text)',
    'admin_dashboard_metrics()',
    'admin_list_members(text)',
    'admin_set_member_status(uuid, account_status)',
    'admin_verify_member_kyc(uuid, boolean)',
    'admin_list_tickets(ticket_status)',
    'admin_ticket_messages(uuid)',
    'admin_reply_ticket(uuid, text, ticket_status)',
    'admin_update_ticket(uuid, ticket_status, uuid)',
    'admin_list_staff()',
    'admin_upsert_staff(uuid, text, text, text, boolean, uuid[])',
    'admin_grant_role(uuid, app_role)',
    'admin_revoke_role(uuid, app_role)',
    'admin_role_matrix()',
    'admin_set_role_permissions(app_role, text[])',
    'admin_set_setting(text, jsonb, text)',
    'admin_delete_setting(text)',
    'admin_list_documents(text)',
    'admin_list_rentals()',
    'admin_set_listing_status(uuid, listing_status)',
    'admin_settle_payout(uuid, text)',
    'admin_list_exchange()',
    'admin_set_exchange_status(uuid, exchange_status)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
