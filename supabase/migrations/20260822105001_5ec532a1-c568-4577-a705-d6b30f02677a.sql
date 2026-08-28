-- Stage 14: reporting engine ------------------------------------------------

insert into public.permissions (key, label, perm_group) values
  ('reports.read', 'View reports and analytics', 'reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
select r.role_key, 'reports.read'
from (values ('ADMIN_STAFF'::app_role), ('SUPER_ADMIN'::app_role)) as r(role_key)
on conflict do nothing;

-- 1. Revenue by month --------------------------------------------------------
create or replace function public.admin_report_revenue(_months integer default 12)
returns table (
  period date,
  captured numeric,
  refunded numeric,
  payment_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with guard as (select public.admin_guard('reports.read')),
  months as (
    select generate_series(
      date_trunc('month', current_date) - ((greatest(coalesce(_months, 12), 1) - 1) * interval '1 month'),
      date_trunc('month', current_date),
      interval '1 month'
    )::date as period
  )
  select
    m.period,
    coalesce((
      select sum(p.amount) from public.payments p
      where p.status = 'captured'
        and date_trunc('month', p.created_at)::date = m.period
    ), 0)::numeric as captured,
    coalesce((
      select sum(r.amount) from public.refunds r
      where r.status in ('processed', 'completed')
        and date_trunc('month', r.created_at)::date = m.period
    ), 0)::numeric as refunded,
    coalesce((
      select count(*) from public.payments p
      where p.status = 'captured'
        and date_trunc('month', p.created_at)::date = m.period
    ), 0)::bigint as payment_count
  from months m, guard
  order by m.period;
$$;

-- 2. Occupancy by resort -----------------------------------------------------
create or replace function public.admin_report_occupancy(
  _start date default (current_date - 30),
  _end date default current_date
)
returns table (
  resort_id uuid,
  resort_name text,
  units bigint,
  nights_available bigint,
  nights_booked bigint,
  occupancy_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with guard as (select public.admin_guard('reports.read')),
  span as (select greatest((_end - _start), 1) as days),
  base as (
    select
      r.id,
      r.name,
      (select count(*) from public.resort_units u where u.resort_id = r.id) as units,
      (select coalesce(sum(
          (least(res.check_out, _end) - greatest(res.check_in, _start))
        ), 0)
       from public.reservations res
       where res.resort_id = r.id
         and res.status in ('confirmed', 'checked_in', 'completed')
         and res.check_in < _end
         and res.check_out > _start) as booked
    from public.resorts r
  )
  select
    b.id,
    b.name,
    b.units,
    (b.units * s.days)::bigint as nights_available,
    greatest(b.booked, 0)::bigint as nights_booked,
    case when b.units * s.days > 0
      then round((greatest(b.booked, 0)::numeric / (b.units * s.days)) * 100, 1)
      else 0 end as occupancy_pct
  from base b, span s, guard
  order by occupancy_pct desc, b.name;
$$;

-- 3. Dues aging --------------------------------------------------------------
create or replace function public.admin_report_dues_aging()
returns table (
  bucket text,
  fee_count bigint,
  amount_due numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with guard as (select public.admin_guard('reports.read')),
  outstanding as (
    select
      greatest(f.amount + coalesce(f.late_fee, 0) - coalesce(f.amount_paid, 0), 0) as due,
      (current_date - f.due_date) as age
    from public.maintenance_fees f
    where f.status in ('pending', 'partial', 'overdue')
  ),
  labelled as (
    select
      case
        when age < 0 then 'Not yet due'
        when age <= 30 then '0-30 days'
        when age <= 60 then '31-60 days'
        when age <= 90 then '61-90 days'
        else '90+ days'
      end as bucket,
      due
    from outstanding
    where due > 0
  ),
  buckets as (
    select * from (values
      ('Not yet due', 1), ('0-30 days', 2), ('31-60 days', 3),
      ('61-90 days', 4), ('90+ days', 5)
    ) as t(bucket, sort_order)
  )
  select
    b.bucket,
    coalesce((select count(*) from labelled l where l.bucket = b.bucket), 0)::bigint,
    coalesce((select sum(l.due) from labelled l where l.bucket = b.bucket), 0)::numeric
  from buckets b, guard
  order by b.sort_order;
$$;

-- 4. Membership / ownership growth ------------------------------------------
create or replace function public.admin_report_growth(_months integer default 12)
returns table (
  period date,
  new_members bigint,
  new_owners bigint,
  new_contracts bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with guard as (select public.admin_guard('reports.read')),
  months as (
    select generate_series(
      date_trunc('month', current_date) - ((greatest(coalesce(_months, 12), 1) - 1) * interval '1 month'),
      date_trunc('month', current_date),
      interval '1 month'
    )::date as period
  )
  select
    m.period,
    coalesce((select count(*) from public.members x
      where date_trunc('month', x.created_at)::date = m.period), 0)::bigint,
    coalesce((select count(*) from public.owners x
      where date_trunc('month', x.created_at)::date = m.period), 0)::bigint,
    (
      coalesce((select count(*) from public.membership_contracts c
        where date_trunc('month', c.created_at)::date = m.period), 0)
      + coalesce((select count(*) from public.ownership_contracts c
        where date_trunc('month', c.created_at)::date = m.period), 0)
    )::bigint
  from months m, guard
  order by m.period;
$$;

-- 5. Resort performance ------------------------------------------------------
create or replace function public.admin_report_resorts()
returns table (
  resort_id uuid,
  resort_name text,
  reservations bigint,
  nights bigint,
  fees numeric,
  cancellations bigint,
  active_listings bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with guard as (select public.admin_guard('reports.read'))
  select
    r.id,
    r.name,
    coalesce((select count(*) from public.reservations res
      where res.resort_id = r.id and res.status <> 'cancelled'), 0)::bigint,
    coalesce((select sum(res.nights) from public.reservations res
      where res.resort_id = r.id and res.status <> 'cancelled'), 0)::bigint,
    coalesce((select sum(res.total_fees) from public.reservations res
      where res.resort_id = r.id and res.status <> 'cancelled'), 0)::numeric,
    coalesce((select count(*) from public.reservations res
      where res.resort_id = r.id and res.status = 'cancelled'), 0)::bigint,
    coalesce((select count(*) from public.rental_listings l
      where l.resort_id = r.id and l.status = 'listed'), 0)::bigint
  from public.resorts r, guard
  order by 4 desc, r.name;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'admin_report_revenue(integer)',
    'admin_report_occupancy(date, date)',
    'admin_report_dues_aging()',
    'admin_report_growth(integer)',
    'admin_report_resorts()'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;