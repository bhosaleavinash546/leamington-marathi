-- Run once in a dedicated Supabase project's SQL editor as postgres.
-- Membership is maintained by trusted administrators in SQL, never by the browser.
begin;
create table public.finance_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','treasurer','contributor','viewer')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create or replace function public.finance_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.finance_members where user_id=(select auth.uid()) and active=true
$$;
revoke all on function public.finance_role() from public;
grant execute on function public.finance_role() to authenticated;
create table public.finance_events (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 120),
 event_date date not null,
 currency text not null default 'GBP' check (currency='GBP'),
 created_at timestamptz not null default now()
);
create table public.finance_categories (
 name text primary key,
 kind text not null check(kind in ('income','expense')),
 unique(name,kind)
);
insert into public.finance_categories(name,kind) values
 ('Venue & facilities','expense'),('Food & catering','expense'),('Decorations','expense'),('Sound & lighting','expense'),('Performers','expense'),('Printing & publicity','expense'),('Equipment & transport','expense'),('Insurance & licences','expense'),('Volunteer reimbursements','expense'),('Other expenses','expense'),
 ('Ticket sales','income'),('Sponsorship','income'),('Stall fees','income'),('Donations','income'),('Other income','income');
create table public.finance_budgets (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.finance_events(id),
 category text not null references public.finance_categories(name),
 amount_pence bigint not null check(amount_pence between 0 and 100000000),
 unique(event_id,category)
);
create table public.finance_transactions (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.finance_events(id),
 kind text not null check (kind in ('income','expense')),
 category text not null,
 description text not null check(length(trim(description)) between 1 and 250),
 counterparty text not null check(length(trim(counterparty)) between 1 and 150),
 amount_pence bigint not null check(amount_pence between 1 and 100000000),
 transaction_date date not null,
 reference text not null default '' check(length(reference)<=120),
 notes text not null default '' check(length(notes)<=2000),
 payment_method text not null check(payment_method in ('Bank transfer','Cash','Card','Online ticket platform','Other')),
 status text not null default 'pending' check(status in ('pending','approved','paid','rejected')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_note text not null default '' check(length(review_note)<=1000),
 foreign key(category,kind) references public.finance_categories(name,kind),
 check(kind='expense' or status in ('approved','paid','rejected'))
);
create table public.finance_invoices (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.finance_events(id),
 transaction_id uuid not null unique references public.finance_transactions(id) on delete cascade,
 drive_file_id text not null unique check(drive_file_id ~ '^[A-Za-z0-9_-]+$'),
 file_name text not null check(length(file_name) between 1 and 200),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.finance_audit (
 id bigint generated always as identity primary key,
 event_id uuid references public.finance_events(id),
 actor_id uuid,
 entity_id uuid not null,
 entity_type text not null,
 action text not null,
 summary text not null,
 changed_at timestamptz not null default now()
);
create index finance_transactions_event_date_idx on public.finance_transactions(event_id,transaction_date desc,created_at desc);
create index finance_invoices_event_idx on public.finance_invoices(event_id);
create index finance_audit_event_time_idx on public.finance_audit(event_id,changed_at desc);
-- Every data table is protected, including membership and audit logs.
alter table public.finance_members enable row level security;
alter table public.finance_events enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_budgets enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_invoices enable row level security;
alter table public.finance_audit enable row level security;
revoke all on public.finance_members,public.finance_events,public.finance_categories,public.finance_budgets,public.finance_transactions,public.finance_invoices,public.finance_audit from anon,authenticated;
grant select on public.finance_members,public.finance_events,public.finance_categories,public.finance_budgets,public.finance_transactions,public.finance_invoices,public.finance_audit to authenticated;
grant insert on public.finance_events,public.finance_budgets,public.finance_transactions to authenticated;
grant update on public.finance_budgets to authenticated;
grant all on public.finance_members,public.finance_events,public.finance_categories,public.finance_budgets,public.finance_transactions,public.finance_invoices,public.finance_audit to service_role;
-- No client UPDATE/DELETE grants on submitted transactions, invoices, users or logs.
create policy member_self on public.finance_members for select to authenticated using(user_id=(select auth.uid()) and active);
create policy events_read on public.finance_events for select to authenticated using((select public.finance_role()) is not null);
create policy events_create on public.finance_events for insert to authenticated with check((select public.finance_role()) in ('admin','treasurer'));
create policy categories_read on public.finance_categories for select to authenticated using((select public.finance_role()) is not null);
create policy budgets_read on public.finance_budgets for select to authenticated using((select public.finance_role()) is not null);
create policy budgets_create on public.finance_budgets for insert to authenticated with check((select public.finance_role()) in ('admin','treasurer'));
create policy budgets_update on public.finance_budgets for update to authenticated using((select public.finance_role()) in ('admin','treasurer')) with check((select public.finance_role()) in ('admin','treasurer'));
create policy transactions_read on public.finance_transactions for select to authenticated using((select public.finance_role()) is not null);
create policy transactions_create on public.finance_transactions for insert to authenticated with check(
 created_by=(select auth.uid()) and reviewed_by is null and reviewed_at is null and review_note='' and
 ((kind='expense' and status='pending' and (select public.finance_role()) in ('admin','treasurer','contributor'))
 or (kind='income' and status in ('approved','paid') and (select public.finance_role()) in ('admin','treasurer')))
);
create policy invoices_read on public.finance_invoices for select to authenticated using((select public.finance_role()) is not null);
create policy audit_read on public.finance_audit for select to authenticated using((select public.finance_role()) is not null);
-- Only the backend may attach invoices. Prevent cross-event associations even there.
create function public.finance_check_invoice() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.finance_transactions where id=new.transaction_id and event_id=new.event_id and created_by=new.uploaded_by) then
  raise exception 'Invoice must match its transaction event and submitter';
 end if;
 return new;
end $$;
create trigger finance_check_invoice before insert on public.finance_invoices for each row execute function public.finance_check_invoice();
create function public.finance_write_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb; event uuid; actor uuid;
begin
 payload=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 event=case when tg_table_name='finance_events' then (payload->>'id')::uuid else (payload->>'event_id')::uuid end;
 actor=coalesce(auth.uid(),(payload->>'created_by')::uuid,(payload->>'uploaded_by')::uuid);
 insert into public.finance_audit(event_id,actor_id,entity_id,entity_type,action,summary)
 values(event,actor,(payload->>'id')::uuid,tg_table_name,tg_op,
 case when tg_table_name='finance_transactions' then concat(payload->>'description',' · ',payload->>'status',case when tg_op='UPDATE' then concat(' (was ',to_jsonb(old)->>'status',')') else '' end)
 when tg_table_name='finance_budgets' then concat(payload->>'category',' · ',payload->>'amount_pence',' pence')
 when tg_table_name='finance_invoices' then payload->>'file_name' else payload->>'name' end);
 return null;
end $$;
create trigger finance_events_audit after insert on public.finance_events for each row execute function public.finance_write_audit();
create trigger finance_budgets_audit after insert or update on public.finance_budgets for each row execute function public.finance_write_audit();
create trigger finance_transactions_audit after insert or update or delete on public.finance_transactions for each row execute function public.finance_write_audit();
create trigger finance_invoices_audit after insert on public.finance_invoices for each row execute function public.finance_write_audit();
create function public.finance_review_transaction(transaction_id uuid,new_status text,note text) returns void language plpgsql security definer set search_path='' as $$
declare record public.finance_transactions;
begin
 if public.finance_role() not in ('admin','treasurer') or public.finance_role() is null then raise exception 'Not permitted'; end if;
 if length(trim(coalesce(note,''))) not between 1 and 1000 then raise exception 'Add a review or payment note (1–1000 characters)'; end if;
 select * into record from public.finance_transactions where id=transaction_id for update;
 if not found then raise exception 'Transaction not found'; end if;
 if not ((record.kind='expense' and record.status='pending' and new_status in ('approved','rejected')) or (record.status='approved' and new_status in ('paid','rejected'))) then raise exception 'Invalid status transition'; end if;
 if record.kind='expense' and new_status='approved' and record.created_by=auth.uid() then raise exception 'Another administrator or treasurer must approve your own claim'; end if;
 update public.finance_transactions set status=new_status,review_note=note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=transaction_id;
end $$;
revoke all on function public.finance_review_transaction(uuid,text,text) from public;
grant execute on function public.finance_review_transaction(uuid,text,text) to authenticated;
revoke all on function public.finance_write_audit(),public.finance_check_invoice() from public;
commit;
