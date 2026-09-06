-- LAPSHA v5: cumulative update for existing v3/v4 databases. Repeatable; preserves menu content.
begin;
alter table public.categories add column if not exists text_align text not null default 'left' check (text_align in ('left','center','right'));
alter table public.items add column if not exists text_align text not null default 'left' check (text_align in ('left','center','right'));
alter table public.items add column if not exists frame_mode text not null default 'auto' check (frame_mode in ('auto','none','alco','nonalco'));
alter table public.items add column if not exists serving_style text not null default 'auto' check (serving_style in ('auto','none','ice','cold'));
alter table public.news add column if not exists title text not null default '';
alter table public.news add column if not exists text_align text not null default 'left' check (text_align in ('left','center','right'));
alter table public.news add column if not exists pinned boolean not null default false;
alter table public.categories add column if not exists description_mode text not null default 'collapse' check (description_mode in ('collapse','small','hidden'));
alter table public.item_groups add column if not exists description text not null default '';
alter table public.item_groups add column if not exists description_mode text not null default 'collapse' check (description_mode in ('collapse','small','hidden'));
alter table public.items drop constraint if exists items_serving_style_check;
alter table public.items add constraint items_serving_style_check check (serving_style in ('auto','none','ice','cold','hot'));
create table if not exists public.alcohol_catalog_cache (
 source text primary key check (source in ('elitalco','alcomag')),
 entries jsonb not null default '[]', refreshed_at timestamptz not null default now()
);
create table if not exists public.alcohol_photo_jobs (
 item_id uuid primary key references public.items(id) on delete cascade,
 status text not null default 'pending', attempts int not null default 0,
 next_run timestamptz not null default now(), lease uuid,
 source_url text, source_name text, source_image text, message text,
 updated_at timestamptz not null default now()
);
alter table public.alcohol_catalog_cache enable row level security;
alter table public.alcohol_photo_jobs enable row level security;
revoke all on public.alcohol_catalog_cache from anon, authenticated;
revoke all on public.alcohol_photo_jobs from anon, authenticated;
grant select on public.alcohol_photo_jobs to authenticated;
grant all on public.alcohol_catalog_cache, public.alcohol_photo_jobs to service_role;
drop policy if exists alcohol_jobs_admin_read on public.alcohol_photo_jobs;
create policy alcohol_jobs_admin_read on public.alcohol_photo_jobs for select to authenticated using (true);

create or replace function public.alcohol_category_eligible(category uuid)
returns boolean language sql stable set search_path = public as $$
 select exists(select 1 from public.categories c where c.id=category and
 (lower(c.slug) in ('alcohol','alcohol-menu','alcohol-card') or lower(trim(c.title)) in ('алкогольная карта','алкоголь','алкогольные напитки')));
$$;

create or replace function public.queue_alcohol_photo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
 if public.alcohol_category_eligible(new.category_id) and nullif(trim(new.image_url),'') is null then
  insert into public.alcohol_photo_jobs(item_id) values(new.id)
  on conflict(item_id) do update set status='pending',next_run=now(),lease=null,message=null,updated_at=now();
 else
  update public.alcohol_photo_jobs set status='skipped',lease=null,updated_at=now(),message='Фото уже заполнено или другая категория' where item_id=new.id;
 end if;
 return new;
end; $$;
drop trigger if exists queue_alcohol_photo on public.items;
create trigger queue_alcohol_photo after insert or update of name,name_en,category_id,group_id,image_url on public.items
for each row execute function public.queue_alcohol_photo();

insert into public.alcohol_photo_jobs(item_id)
select id from public.items where public.alcohol_category_eligible(category_id) and nullif(trim(image_url),'') is null
on conflict(item_id) do nothing;

create or replace function public.claim_alcohol_photo()
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.alcohol_photo_jobs; i public.items;
begin
 select q.* into j from public.alcohol_photo_jobs q join public.items x on x.id=q.item_id
 where q.status in ('pending','retry','unmatched','processing') and q.next_run<=now()
 and public.alcohol_category_eligible(x.category_id) and nullif(trim(x.image_url),'') is null
 order by q.next_run,q.item_id limit 1 for update of q skip locked;
 if j.item_id is null then return null; end if;
 update public.alcohol_photo_jobs set status='processing',lease=gen_random_uuid(),attempts=attempts+1,
 next_run=now()+interval '5 minutes',updated_at=now() where item_id=j.item_id returning * into j;
 select * into i from public.items where id=j.item_id;
 return jsonb_build_object('job',to_jsonb(j),'item',to_jsonb(i));
end; $$;

create or replace function public.finish_alcohol_photo(p_item uuid,p_lease uuid,p_snapshot jsonb,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare i public.items; j public.alcohol_photo_jobs; state text;
begin
 -- Lock in the same order as the item-update trigger to avoid deadlocks.
 select * into i from public.items where id=p_item for update;
 select * into j from public.alcohol_photo_jobs where item_id=p_item for update;
 if i.id is null or j.lease is distinct from p_lease or p_lease is null then return false; end if;
 if i.name is distinct from (p_snapshot->>'name') or coalesce(i.name_en,'')<>coalesce(p_snapshot->>'name_en','')
 or i.category_id::text is distinct from (p_snapshot->>'category_id')
 or coalesce(i.group_id::text,'')<>coalesce(p_snapshot->>'group_id','')
 or nullif(trim(i.image_url),'') is not null or not public.alcohol_category_eligible(i.category_id) then
  update public.alcohol_photo_jobs set status='pending',lease=null,next_run=now(),updated_at=now() where item_id=p_item;
  return false;
 end if;
 state=p_result->>'status';
 if state not in ('done','retry','unmatched') then raise exception 'Invalid result'; end if;
 if state='done' then
  if nullif(p_result->>'image_url','') is null then raise exception 'Missing image'; end if;
  update public.items set image_url=p_result->>'image_url',
   teaser=case when nullif(trim(teaser),'') is null then coalesce(p_result->>'teaser',teaser) else teaser end,
   taste=case when nullif(trim(taste),'') is null then coalesce(p_result->>'taste',taste) else taste end,
   aroma=case when nullif(trim(aroma),'') is null then coalesce(p_result->>'aroma',aroma) else aroma end
   where id=p_item;
 end if;
 update public.alcohol_photo_jobs set status=state,lease=null,
  next_run=now()+case when state='retry' then interval '1 hour' else interval '7 days' end,
  source_url=p_result->>'source_url',source_name=p_result->>'source_name',source_image=p_result->>'source_image',
  message=left(p_result->>'message',500),updated_at=now() where item_id=p_item;
 return true;
end; $$;
revoke all on function public.alcohol_category_eligible(uuid), public.queue_alcohol_photo(),public.claim_alcohol_photo(),public.finish_alcohol_photo(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.alcohol_category_eligible(uuid),public.claim_alcohol_photo(),public.finish_alcohol_photo(uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
