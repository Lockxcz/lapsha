import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('v7 persistent stop dates, quiz validation and login-compatible permissions',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table settings(id int primary key);insert into settings values(1);
 create table categories(id uuid primary key default gen_random_uuid(),title text,published boolean default true,sort_order int default 0);
 create table item_groups(id uuid primary key default gen_random_uuid(),category_id uuid,sort_order int default 0);
 create table items(id uuid primary key default gen_random_uuid(),category_id uuid,name text,image_url text,price text,published boolean default true,sort_order int default 0);
 create table news(id uuid primary key default gen_random_uuid(),title text,message text,pinned boolean default false,published boolean default true,created_at timestamptz default now());
 grant select on settings,categories,item_groups,items,news to anon,authenticated;
 insert into categories(title) values('Бар');insert into items(category_id,name,image_url,price) select id,'Кофе','photo.jpg','900' from categories;insert into items(category_id,name,published) select id,'Черновик',false from categories;
 insert into auth.users values('00000000-0000-0000-0000-000000000001');`);
 const sql=await readFile(new URL('../supabase/update-v7.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const items=(await db.query('select * from items order by name')).rows,first=items[0],second=items[1];
 const snapshot=async(admin=false)=>(await db.query('select pos_snapshot($1) v',[admin])).rows[0].v;
 const change=async(changes)=>(await db.query('select pos_set_availability($1) v',[changes])).rows[0].v;
 await db.exec('set role anon');assert.equal((await snapshot()).items.length,1);await assert.rejects(snapshot(true),/Требуется вход/);await assert.rejects(change([]),/permission denied/);await assert.rejects(db.exec("insert into item_availability(item_id) select id from items"),/permission denied/);
 await db.exec("reset role;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';set role authenticated");assert.equal((await snapshot(true)).items.length,2);
 assert.equal(await change([{item_id:first.id,revision:0,status:'stop',reason:'Закончился',expected_at:'2020-01-01'}]),1);
 let s=await snapshot();assert.equal(s.availability[0].status,'stop');assert.ok(s.availability[0].stop_since);assert.equal(s.availability[0].expected_at,null);assert.equal(s.events.length,1);assert.equal(s.items[0].image_url,'photo.jpg');assert.equal(s.items[0].price,'900');
 await db.exec('reset role;alter table item_availability disable trigger pos_stop_date');await db.query("update item_availability set stop_since='2020-01-01' where item_id=$1",[first.id]);await db.exec('alter table item_availability enable trigger pos_stop_date');await db.exec(sql);await db.exec('set role authenticated');s=await snapshot();assert.match(s.availability[0].stop_since,/2020-01-01/);assert.equal(s.availability[0].status,'stop');const eventCount=s.events.length;const since=s.availability[0].stop_since;assert.equal(await change([{item_id:first.id,revision:1,status:'stop',reason:'Закончился'}]),0);assert.equal((await snapshot()).availability[0].stop_since,since);assert.equal((await snapshot()).events.length,eventCount);
 await assert.rejects(change([{item_id:second.id,revision:0,status:'stop'},{item_id:first.id,revision:0,status:'available'}]),/другой редактор/);assert.equal((await snapshot(true)).availability.length,1);
 await assert.rejects(change([{item_id:first.id,revision:1,status:'limited',quantity:0}]),/Неизвестный статус/);
 assert.equal(await change([{item_id:first.id,revision:1,status:'available',reason:'stale',quantity:5}]),1);s=await snapshot();assert.equal(s.availability[0].reason,'');assert.equal(s.availability[0].quantity,null);
 await db.exec("reset role;insert into news(title,message) values('Новость','Текст');insert into news(title,message,expires_at) values('Истекла','Текст','2020-01-01');insert into news(title,message,published) values('Черновик','Текст',false);");
 s=await snapshot();assert.equal(s.news.length,1);assert.equal(s.events.filter(e=>e.kind==='news').length,1);const revision=s.revision;await db.exec("update items set price='1000'");assert.ok((await snapshot()).revision>revision);
 await db.exec("set role authenticated");await db.query('insert into menu_questions(question,options,correct_index) values($1,$2,$3)',['Какой ответ?', ['a','b','c','d'],0]);await assert.rejects(db.query('insert into menu_questions(question,options,correct_index) values($1,$2,$3)',['Какой ответ?', ['a','a','c','d'],0]),/повторяться/);await db.exec("reset role;set request.jwt.claim.sub='';set role anon");assert.equal((await db.query('select * from menu_questions')).rows.length,0);await assert.rejects(db.query('insert into menu_questions(question,options,correct_index) values($1,$2,$3)',['Какой ответ?', ['a','b','c','d'],0]),/permission denied/);await db.exec("reset role;set request.jwt.claim.sub='';set role authenticated");await assert.rejects(change([{item_id:first.id,revision:2,status:'stop'}]),/Требуется вход/);
 }finally{await db.close();}
});
