import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('SQL queue: existing/new alcohol, private access, exact snapshot and manual field preservation',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table categories(id uuid primary key default gen_random_uuid(),slug text,title text);
 create table item_groups(id uuid primary key default gen_random_uuid());create table news(id uuid primary key default gen_random_uuid());
 create table items(id uuid primary key default gen_random_uuid(),category_id uuid references categories(id),group_id uuid,name text,name_en text default '',image_url text,teaser text default '',taste text default '',aroma text default '');
 insert into categories(slug,title) values('alcohol','Алкогольная карта'),('soft','Безалкогольные напитки');
 insert into items(category_id,name) select id,'Bulleit Rye' from categories where slug='alcohol';
 insert into items(category_id,name) select id,'Лимонад' from categories where slug='soft';`);
 const sql=await readFile(new URL('../supabase/update-v5.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('select * from alcohol_photo_jobs')).rows.length,1);
 await db.exec('set role authenticated');assert.equal((await db.query('select * from alcohol_photo_jobs')).rows.length,1);
 await assert.rejects(db.query('select claim_alcohol_photo()'),/permission denied/);await assert.rejects(db.query('select * from alcohol_catalog_cache'),/permission denied/);await db.exec('reset role');
 await db.exec('set role anon');await assert.rejects(db.query('select * from alcohol_photo_jobs'),/permission denied/);await db.exec('reset role');
 const claim=async()=>(await db.query('select claim_alcohol_photo() as v')).rows[0].v;
 const finish=async(c,result)=>(await db.query('select finish_alcohol_photo($1,$2,$3,$4) as v',[c.item.id,c.job.lease,c.item,result])).rows[0].v;
 let c=await claim();assert.equal(c.item.name,'Bulleit Rye');assert.equal(await claim(),null);
 await db.query("update items set teaser='Авторский текст' where id=$1",[c.item.id]);
 assert.equal(await finish(c,{status:'done',image_url:'https://project.supabase.co/bottle.jpg',teaser:'Новый текст',taste:'Ваниль'}),true);
 let item=(await db.query('select * from items where id=$1',[c.item.id])).rows[0];assert.equal(item.teaser,'Авторский текст');assert.equal(item.taste,'Ваниль');assert.ok(item.image_url);assert.equal(await claim(),null);
 await db.query("update items set image_url=null where id=$1",[c.item.id]);c=await claim();assert.ok(c);
 await db.query("update items set image_url='manual.jpg' where id=$1",[c.item.id]);assert.equal(await finish(c,{status:'done',image_url:'automatic.jpg'}),false);assert.equal((await db.query('select image_url from items where id=$1',[c.item.id])).rows[0].image_url,'manual.jpg');
 await db.query('update items set image_url=null where id=$1',[c.item.id]);c=await claim();await db.query("update items set name='Bulleit Bourbon' where id=$1",[c.item.id]);assert.equal(await finish(c,{status:'done',image_url:'wrong.jpg'}),false);
 c=await claim();assert.equal(c.item.name,'Bulleit Bourbon');assert.equal(await finish(c,{status:'unmatched'}),true);assert.equal(await claim(),null);
 await db.exec("insert into items(category_id,name) select id,'Hennessy VSOP' from categories where slug='alcohol'");c=await claim();assert.equal(c.item.name,'Hennessy VSOP');
 await db.query("update items set category_id=(select id from categories where slug='soft') where id=$1",[c.item.id]);assert.equal(await finish(c,{status:'done',image_url:'wrong.jpg'}),false);
 }finally{await db.close();}
});
