-- Cumulative v7: install on v5 or v6. Do not run update-v6 afterwards.
-- LAPSHA POS v6. Run on the EXISTING project. Repeatable, no menu content replaced.
begin;
alter table public.news add column if not exists updated_at timestamptz not null default now();
alter table public.news add column if not exists priority text not null default 'normal' check(priority in ('normal','important','urgent'));
alter table public.news add column if not exists expires_at timestamptz;
create table if not exists public.item_availability (
 item_id uuid primary key references public.items(id) on delete cascade,
 status text not null default 'available' check(status in ('available','stop','limited')),
 reason text not null default '' check(length(reason)<=200), expected_at timestamptz,
 quantity integer check(quantity>=0), revision bigint not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 check(status<>'limited' or quantity is null or quantity>0)
);
create table if not exists public.pos_events (
 id bigint generated always as identity primary key,
 kind text not null check(kind in ('availability','news')),
 entity_id uuid not null, title text not null, message text not null default '',
 status text, created_at timestamptz not null default now()
);
create index if not exists pos_events_created_idx on public.pos_events(created_at desc);
create table if not exists public.pos_revision(id int primary key check(id=1),revision bigint not null default 0);
insert into public.pos_revision(id) values(1) on conflict do nothing;
alter table public.item_availability enable row level security;
alter table public.pos_events enable row level security;
alter table public.pos_revision enable row level security;
revoke all on public.item_availability,public.pos_events,public.pos_revision from anon,authenticated;
grant select on public.item_availability,public.pos_events,public.pos_revision to anon,authenticated;
grant all on public.item_availability,public.pos_events,public.pos_revision to service_role;
drop policy if exists pos_availability_read on public.item_availability;
create policy pos_availability_read on public.item_availability for select to anon,authenticated using (
 auth.uid() is not null or exists(select 1 from public.items i join public.categories c on c.id=i.category_id where i.id=item_id and i.published and c.published));
drop policy if exists pos_events_read on public.pos_events;
create policy pos_events_read on public.pos_events for select to anon,authenticated using (
 auth.uid() is not null or
 (kind='availability' and exists(select 1 from public.items i join public.categories c on c.id=i.category_id where i.id=entity_id and i.published and c.published)) or
 (kind='news' and exists(select 1 from public.news n where n.id=entity_id and n.published)));
drop policy if exists pos_revision_read on public.pos_revision;
create policy pos_revision_read on public.pos_revision for select to anon,authenticated using(true);

create or replace function public.pos_touch_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin update public.pos_revision set revision=revision+1 where id=1;return null;end;$$;
create or replace function public.pos_availability_event() returns trigger language plpgsql security definer set search_path=public as $$
declare label text;
begin
 select i.name into label from public.items i join public.categories c on c.id=i.category_id where i.id=new.item_id and i.published and c.published;
 if label is not null then
 insert into public.pos_events(kind,entity_id,title,message,status) values('availability',new.item_id,label,
 case new.status when 'stop' then 'В стоп-листе' when 'limited' then 'Мало в наличии' else 'Снова доступно' end || case when new.reason<>'' then ' · '||new.reason else '' end,new.status);
 end if; return new;
end;$$;
drop trigger if exists pos_availability_event on public.item_availability;
create trigger pos_availability_event after insert or update on public.item_availability for each row execute function public.pos_availability_event();
create or replace function public.pos_news_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' then
  if (new.title,new.message,new.published,new.pinned,new.priority,new.expires_at) is not distinct from (old.title,old.message,old.published,old.pinned,old.priority,old.expires_at) then return new;end if;
 end if;
 new.updated_at=now();
 if new.published and (new.expires_at is null or new.expires_at>now()) then
 insert into public.pos_events(kind,entity_id,title,message,status) values('news',new.id,coalesce(nullif(new.title,''),'Новость'),left(new.message,1000),new.priority);
 end if;return new;
end;$$;
drop trigger if exists pos_news_event on public.news;
create trigger pos_news_event before insert or update on public.news for each row execute function public.pos_news_event();

do $$ declare t text;begin
 foreach t in array array['settings','categories','item_groups','items','news','item_availability'] loop
 execute format('drop trigger if exists pos_revision_changed on public.%I',t);
 execute format('create trigger pos_revision_changed after insert or update or delete on public.%I for each statement execute function public.pos_touch_revision()',t);
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pos_revision') then
 alter publication supabase_realtime add table public.pos_revision;
 end if;
end;$$;

create or replace function public.pos_set_availability(p_changes jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare change jsonb; current_row public.item_availability; target uuid; new_status text; total int=0; new_quantity int; new_reason text; new_expected timestamptz;
begin
 if auth.uid() is null then raise exception 'Требуется вход администратора' using errcode='42501';end if;
 if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)<1 or jsonb_array_length(p_changes)>200 then raise exception 'Выберите от 1 до 200 позиций';end if;
 if (select count(distinct x->>'item_id') from jsonb_array_elements(p_changes) x)<>jsonb_array_length(p_changes) then raise exception 'Повторяющиеся позиции';end if;
 for change in select value from jsonb_array_elements(p_changes) order by value->>'item_id' loop
 target=(change->>'item_id')::uuid;
 -- Lock the parent first: serializes even a first availability row, without deleting menu content.
 perform 1 from public.items where id=target for update;
 if not found then raise exception 'Напиток удалён. Обновите список';end if;
 select * into current_row from public.item_availability where item_id=target for update;
 if coalesce(current_row.revision,0) is distinct from (change->>'revision')::bigint then raise exception 'Статус уже изменил другой редактор. Обновите список';end if;
 new_status=change->>'status';new_reason=coalesce(change->>'reason','');new_expected=(nullif(change->>'expected_at',''))::timestamptz;new_quantity=(nullif(change->>'quantity',''))::integer;
 if new_status not in ('available','stop') or new_status is null then raise exception 'Неизвестный статус';end if;
 if length(new_reason)>200 then raise exception 'Причина: максимум 200 символов';end if;
 if new_quantity<0 or (new_status='limited' and new_quantity=0) then raise exception 'Для малого остатка укажите положительное количество или оставьте пустым';end if;
 if new_status='available' then new_reason='';new_expected=null;new_quantity=null;end if;
 if (coalesce(current_row.status,'available'),coalesce(current_row.reason,''),current_row.expected_at,current_row.quantity) is not distinct from (new_status,new_reason,new_expected,new_quantity) then continue;end if;
 insert into public.item_availability(item_id,status,reason,expected_at,quantity,revision,updated_by) values(target,new_status,new_reason,new_expected,new_quantity,1,auth.uid())
 on conflict(item_id) do update set status=excluded.status,reason=excluded.reason,expected_at=excluded.expected_at,quantity=excluded.quantity,revision=public.item_availability.revision+1,updated_at=now(),updated_by=auth.uid();
 total=total+1;
 end loop; return total;
end;$$;

create or replace function public.pos_snapshot(p_admin boolean default false) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if p_admin and auth.uid() is null then raise exception 'Требуется вход администратора' using errcode='42501';end if;
 select jsonb_build_object(
 'revision',(select revision from public.pos_revision where id=1),'server_time',now(),
 'settings',(select to_jsonb(s) from public.settings s where id=1),
 'categories',coalesce((select jsonb_agg(c order by c.sort_order,c.id) from public.categories c where p_admin or c.published),'[]'::jsonb),
 'groups',coalesce((select jsonb_agg(g order by g.sort_order,g.id) from public.item_groups g join public.categories c on c.id=g.category_id where p_admin or c.published),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(i order by i.sort_order,i.id) from public.items i join public.categories c on c.id=i.category_id where p_admin or (i.published and c.published)),'[]'::jsonb),
 'availability',coalesce((select jsonb_agg(a) from public.item_availability a join public.items i on i.id=a.item_id join public.categories c on c.id=i.category_id where p_admin or (i.published and c.published)),'[]'::jsonb),
 'news',coalesce((select jsonb_agg(n order by n.pinned desc,n.created_at desc,n.id) from public.news n where p_admin or (n.published and (n.expires_at is null or n.expires_at>now()))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(e order by e.id desc) from (select e.* from public.pos_events e where p_admin or
 (e.kind='news' and exists(select 1 from public.news n where n.id=e.entity_id and n.published and (n.expires_at is null or n.expires_at>now()))) or
 (e.kind='availability' and exists(select 1 from public.items i join public.categories c on c.id=i.category_id where i.id=e.entity_id and i.published and c.published)) order by e.id desc limit 100) e),'[]'::jsonb)
 ) into result;return result;
end;$$;
revoke all on function public.pos_set_availability(jsonb),public.pos_snapshot(boolean),public.pos_touch_revision(),public.pos_availability_event(),public.pos_news_event() from public,anon,authenticated;
grant execute on function public.pos_snapshot(boolean) to anon,authenticated;
grant execute on function public.pos_set_availability(jsonb) to authenticated;
notify pgrst,'reload schema';

alter table public.item_availability add column if not exists stop_since timestamptz;
-- Legacy "limited" is not a stop. Keep existing STOP rows and their dates.
update public.item_availability set stop_since=updated_at where status='stop' and stop_since is null;
update public.item_availability set status='available',reason='',quantity=null,expected_at=null,revision=revision+1 where status='limited';
create or replace function public.pos_stop_date() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status not in ('stop','available') then raise exception 'Доступны только стоп и наличие';end if;
 new.quantity=null;new.expected_at=null;
 if new.status='stop' then
  if tg_op='INSERT' then new.stop_since=now();
  elsif old.status<>'stop' then new.stop_since=now();
  else new.stop_since=coalesce(old.stop_since,old.updated_at);end if;
 else new.stop_since=null;end if;return new;
end;$$;
drop trigger if exists pos_stop_date on public.item_availability;
create trigger pos_stop_date before insert or update on public.item_availability for each row execute function public.pos_stop_date();
create table if not exists public.menu_questions(
 id uuid primary key default gen_random_uuid(),category_id uuid references public.categories(id) on delete set null,
 question text not null check(length(trim(question)) between 5 and 500),
 options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options)=4),
 correct_index int not null check(correct_index between 0 and 3),explanation text not null default '' check(length(explanation)<=2000),
 published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create or replace function public.validate_menu_question() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from jsonb_array_elements(new.options) o where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}')) not between 1 and 500) then raise exception 'Заполните четыре варианта ответа';end if;
 if (select count(distinct lower(trim(o#>>'{}'))) from jsonb_array_elements(new.options) o)<>4 then raise exception 'Варианты не должны повторяться';end if;
 new.updated_at=now();return new;
end;$$;
drop trigger if exists menu_question_validate on public.menu_questions;
create trigger menu_question_validate before insert or update on public.menu_questions for each row execute function public.validate_menu_question();
alter table public.menu_questions enable row level security;
grant select on public.menu_questions to anon,authenticated;
grant insert,update,delete on public.menu_questions to authenticated;
drop policy if exists questions_read on public.menu_questions;
create policy questions_read on public.menu_questions for select to anon,authenticated using(published or auth.uid() is not null);
drop policy if exists questions_write on public.menu_questions;
create policy questions_write on public.menu_questions for all to authenticated using(auth.uid() is not null) with check(auth.uid() is not null);
revoke all on function public.pos_stop_date(),public.validate_menu_question() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
