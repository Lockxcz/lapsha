-- LAPSHA v3. Run ONCE in the existing project's SQL Editor, before uploading code.
-- Safe to repeat. No content is deleted; existing rows receive compatible defaults.
begin;
alter table public.categories add column if not exists text_align text not null default 'left' check (text_align in ('left','center','right'));
alter table public.items add column if not exists text_align text not null default 'left' check (text_align in ('left','center','right'));
alter table public.items add column if not exists frame_mode text not null default 'auto' check (frame_mode in ('auto','none','alco','nonalco'));
alter table public.items add column if not exists serving_style text not null default 'auto' check (serving_style in ('auto','none','ice','cold'));
alter table public.news add column if not exists title text not null default '';
alter table public.news add column if not exists text_align text not null default 'left' check (text_align in ('left','center','right'));
alter table public.news add column if not exists pinned boolean not null default false;
notify pgrst, 'reload schema';
commit;
