import test from 'node:test';import assert from 'node:assert/strict';
import {safeURL,tokens,exactMatch,parseProduct,parseIndex,shortlist,checkImage,download,descriptions} from '../server/catalog.mjs';
test('source allowlist rejects redirects, credentials, HTTP and foreign hosts',async()=>{
 for(const url of ['http://alcomag.kz/a','https://alcomag.kz.evil.org/a','https://user:pass@alcomag.kz/a','https://127.0.0.1/a','https://alcomag.kz:444/a'])assert.throws(()=>safeURL(url));
 assert.equal(safeURL('https://https://elitclub.kz/upload/a.jpg'),'https://elitclub.kz/upload/a.jpg');
 await assert.rejects(download('https://alcomag.kz/a',{fetcher:async()=>new Response(null,{status:302,headers:{location:'https://example.org/'}})}),/Unapproved/);
});
test('bottle volume and strength normalize, age and variants remain significant',()=>{
 assert.equal(exactMatch({name:'Glenmorangie Original 12 Years'},{name:'Glenmorangie Original 12 Yers Old 0,7'}),true);
 for(const source of ['Glenmorangie Original 10 Years','Glenmorangie Quinta Ruban 12 Years'])assert.equal(exactMatch({name:'Glenmorangie Original 12 Years'},{name:source}),false);
 assert.equal(exactMatch({name:'Hennessy VSOP'},{name:'Коньяк Hennessy V.S.O.P. 40% 0.7L'}),true);
 assert.equal(exactMatch({name:'Bulleit Rye'},{name:'Bulleit Bourbon'}),false);
 assert.equal(exactMatch({name:'Gordons'},{name:'Gin Gordons 0.0%'}),false);
 assert.equal(exactMatch({name:'Macallan 12 Years'},{name:'Macallan Double Cask 12 Years'}),false);
 assert.equal(exactMatch({name:'Martini Riserva (Ambrato / Rubino)'},{name:'Martini Riserva Ambrato'}),false);
 assert.equal(exactMatch({name:'Wine Estate 2020'},{name:'Wine Estate 2021'}),false);
});
test('parses actual Product scope instead of logo and unrelated recommendations',()=>{
 const p=parseProduct('<meta property="og:image" content="/logo.png"><div itemtype="http://schema.org/Product"><span itemprop="name">Bulleit Rye</span><img itemprop="image" src="assets/bottle.jpg"><div itemprop="description">Ноты ванили.</div></div>','https://alcomag.kz/catalog/a/b/c');
 assert.equal(p.image,'https://alcomag.kz/assets/bottle.jpg');assert.equal(p.name,'Bulleit Rye');
 const n=parseProduct('<script type="application/ld+json">{"@type":"WebSite"}</script><script type="application/ld+json">{"@type":"Product","name":"Bulleit Rye","image":"https://elitclub.kz/bottle.jpg"}</script><div id="nav-description"><div class="product-description"><h4>Вкус:</h4>ваниль<h4>Аромат:</h4>ореховые ноты</div></div><div>Рекомендация: шоколад</div>','https://newelitalco.kz/ru/catalog/a');
 assert.equal(n.image,'https://elitclub.kz/bottle.jpg');assert.equal(descriptions(n).taste,'ваниль');assert.equal(descriptions(n).aroma,'ореховые оттенки');assert.ok(!descriptions(n).teaser.includes('шоколад'));
});
test('indexes accept only trusted products and shortlist preserves variant',()=>{
 const entries=parseIndex('elitalco',JSON.stringify({entries:[{type:'product',loc:'https://newelitalco.kz/ru/catalog/bulleit-rye-45-07l_123'},{type:'product',loc:'https://evil.org/bulleit-rye'},{type:'category',loc:'https://newelitalco.kz/ru/catalog/rye'}]}));
 assert.equal(entries.length,1);assert.equal(shortlist({name:'Bulleit Rye'},entries).length,1);assert.equal(shortlist({name:'Bulleit Bourbon'},entries).length,0);
});
test('rejects HTML masquerading as an image and excessive responses',async()=>{
 assert.throws(()=>checkImage({bytes:Buffer.alloc(600),type:'image/jpeg'}));
 assert.throws(()=>checkImage({bytes:Buffer.from([255,216,255]),type:'image/jpeg'}));
 const bytes=Buffer.alloc(600);bytes.set([255,216,255]);assert.equal(checkImage({bytes,type:'image/jpeg'}).ext,'jpg');
 await assert.rejects(download('https://alcomag.kz/a',{max:100,fetcher:async()=>new Response(Buffer.alloc(101))}),/too large/);
});
