import test from 'node:test';import assert from 'node:assert/strict';import {synchronize} from '../server/sync.mjs';
function setup({match=true,applied=true}={}){
 const writes=[],uploads=[],removes=[];const now=()=>100000000;const item={id:'drink',name:match?'Bulleit Rye':'Bulleit Bourbon'};
 const db={async request(path,opts){
  if(path.includes('cache?select'))return ['elitalco','alcomag'].map(source=>({source,refreshed_at:new Date(now()).toISOString(),entries:[{source,url:'https://alcomag.kz/catalog/a/b/c',name:item.name}]}));
  if(path.includes('claim_'))return {item,job:{lease:'lease',attempts:1}};
  if(path.includes('finish_')){writes.push(opts.body.p_result);return applied;}
 },async upload(...args){uploads.push(args);return 'https://project.supabase.co/storage/photo.jpg';},async remove(path){removes.push(path);}};
 const get=async url=>{if(url.endsWith('.jpg')){const bytes=Buffer.alloc(600);bytes.set([255,216,255]);return {bytes,type:'image/jpeg',url};}return {bytes:Buffer.from('<div itemtype="http://schema.org/Product"><span itemprop="name">Bulleit Rye</span><img itemprop="image" src="/bottle.jpg"></div>'),url};};
 return {db,get,now,writes,uploads,removes};
}
test('exact product uploads once and records provenance',async()=>{const ctx=setup();assert.equal((await synchronize({},ctx)).status,'done');assert.equal(ctx.uploads.length,1);assert.equal(ctx.writes[0].source_name,'Bulleit Rye');});
test('wrong variant never uploads',async()=>{const ctx=setup({match:false});assert.equal((await synchronize({},ctx)).status,'unmatched');assert.equal(ctx.uploads.length,0);});
test('concurrent manual edit removes unused automatic upload',async()=>{const ctx=setup({applied:false});assert.equal((await synchronize({},ctx)).status,'changed-during-sync');assert.equal(ctx.removes.length,1);});
test('upstream failure schedules retry, not a false unmatched result',async()=>{const ctx=setup();ctx.get=async()=>{throw Error('Source HTTP 503');};assert.equal((await synchronize({},ctx)).status,'retry');assert.equal(ctx.uploads.length,0);});

test('unavailable first source does not prevent caching the second source',async()=>{
 const saved=[];const db={async request(path,opts){if(path.includes('?select'))return [];saved.push(opts.body);}};
 const result=await synchronize({},{db,get:async url=>{if(url.includes('newelitalco'))throw Error('Offline');return {bytes:Buffer.from('<urlset><url><loc>https://alcomag.kz/catalog/strong/whisky/bulleit-rye</loc></url></urlset>')};}});
 assert.equal(result.status,'catalogue-refreshed');assert.equal(result.source,'alcomag');assert.equal(saved.length,1);
});
