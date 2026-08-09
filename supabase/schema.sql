-- ============================================================
-- LAPSHA BAR WOK — GUIDE  ·  Supabase schema
-- Выполнить целиком в Supabase Dashboard → SQL Editor → New query
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- SETTINGS (единственная строка: бренд + дизайн) ----------
create table if not exists settings (
  id            int primary key default 1,
  site_title    text not null default 'LAPSHA BAR WOK',
  hero_eyebrow  text not null default 'ГИД ПО БАРНОМУ МЕНЮ',
  hero_title    text not null default 'Гид по <em>барному</em> меню',
  hero_subtitle text not null default 'Для обучения сотрудников ресторана',
  hero_quote    text not null default 'Мы не просто подаём напитки — мы создаём впечатления.',
  logo_url      text,
  favicon_url   text,
  color_bg          text not null default '#15100c',
  color_surface     text not null default '#241c14',
  color_gold        text not null default '#c9a24b',
  color_gold_bright text not null default '#e9c877',
  color_text        text not null default '#f1e8d8',
  color_text_muted  text not null default '#a89a86',
  font_heading  text not null default 'Fraunces',
  font_body     text not null default 'Manrope',
  updated_at    timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------- CATEGORIES ----------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  icon        text not null default 'cup',          -- см. набор иконок в app.js
  description text default '',
  staff_tip   text default '',                       -- совет официанту (жёлтый блок)
  sort_order  int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- GROUPS (необязательные подгруппы внутри категории,
-- напр. "Белые вина" / "Красные вина", "Виски Шотландии" и т.д.) ----------
create table if not exists item_groups (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories(id) on delete cascade,
  title        text not null,
  sort_order   int not null default 0
);

-- ---------- ITEMS (сами напитки) ----------
create table if not exists items (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references categories(id) on delete cascade,
  group_id       uuid references item_groups(id) on delete set null,
  name           text not null,
  name_en        text default '',
  composition    text default '',                 -- состав (список строк через \n)
  taste          text default '',
  aroma          text default '',
  aftertaste     text default '',
  mood_tags      text[] default '{}',              -- чипы-теги, напр. {Освежающий,Крепкий}
  teaser         text default '',                  -- короткое описание в карточке
  presentation   text default '',                  -- «Как презентовать гостю»
  who_for        text default '',                  -- «Кому рекомендовать»
  fact           text default '',                  -- интересный факт
  pairing        text default '',                  -- сочетание с блюдами (вина)
  country        text default '',
  price          text default '',
  image_url      text,
  sort_order     int not null default 0,
  published      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Примечание: полнотекстовый поиск делает сайт на клиенте (assets/app.js),
-- он собирает строку поиска из всех полей позиции на лету — отдельная
-- generated-колонка/индекс в базе для этого не требуются.
create index if not exists items_category_idx on items (category_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Публичный сайт читает всё (published = true) без авторизации.
-- Изменять данные может только залогиненный админ (Supabase Auth user).
-- ============================================================
alter table settings enable row level security;
alter table categories enable row level security;
alter table item_groups enable row level security;
alter table items enable row level security;

-- READ (anon + authenticated)
create policy "public read settings" on settings for select using (true);
create policy "public read categories" on categories for select using (true);
create policy "public read groups" on item_groups for select using (true);
create policy "public read items" on items for select using (true);

-- WRITE (только авторизованные пользователи — админы, создаются вручную в Supabase Auth)
create policy "admin write settings" on settings for update using (auth.role() = 'authenticated');
create policy "admin insert categories" on categories for insert with check (auth.role() = 'authenticated');
create policy "admin update categories" on categories for update using (auth.role() = 'authenticated');
create policy "admin delete categories" on categories for delete using (auth.role() = 'authenticated');
create policy "admin insert groups" on item_groups for insert with check (auth.role() = 'authenticated');
create policy "admin update groups" on item_groups for update using (auth.role() = 'authenticated');
create policy "admin delete groups" on item_groups for delete using (auth.role() = 'authenticated');
create policy "admin insert items" on items for insert with check (auth.role() = 'authenticated');
create policy "admin update items" on items for update using (auth.role() = 'authenticated');
create policy "admin delete items" on items for delete using (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE (фото напитков, логотип)
-- Выполнить один раз: создаёт публичный bucket "guide-media"
-- ============================================================
insert into storage.buckets (id, name, public)
values ('guide-media', 'guide-media', true)
on conflict (id) do nothing;

create policy "public read guide-media" on storage.objects
  for select using (bucket_id = 'guide-media');

create policy "admin upload guide-media" on storage.objects
  for insert with check (bucket_id = 'guide-media' and auth.role() = 'authenticated');

create policy "admin update guide-media" on storage.objects
  for update using (bucket_id = 'guide-media' and auth.role() = 'authenticated');

create policy "admin delete guide-media" on storage.objects
  for delete using (bucket_id = 'guide-media' and auth.role() = 'authenticated');

-- ============================================================
-- Стартовые категории (пустые — контент сотрудник добавит через админ-панель)
-- ============================================================
insert into categories (slug, title, icon, sort_order) values
  ('coffee',      'Кофе',                 'coffee',   1),
  ('tea-signature','Авторские чаи',       'tea',      2),
  ('tea-leaf',    'Листовой чай',         'leaf',     3),
  ('lemonade',    'Авторские лимонады',   'lemon',    4),
  ('smoothie',    'Авторские смузи',      'smoothie', 5),
  ('matcha',      'Матча',                'matcha',   6),
  ('fresh',       'Фреши',                'fresh',    7),
  ('cocktails-signature','Авторские коктейли','cocktail',8),
  ('cocktails-classic',  'Классические коктейли','cocktail',9),
  ('alcohol',     'Алкогольная карта',    'bottle',   10),
  ('soft',        'Безалкогольные напитки','soda',    11)
on conflict (slug) do nothing;
