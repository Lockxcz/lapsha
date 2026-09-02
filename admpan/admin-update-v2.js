/* LAPSHA Admin convenience update v2 */
(function(){
  'use strict';

  function addStyles(){
    const style = document.createElement('style');
    style.textContent = `
      .drink-type-tools{margin-top:9px;display:flex;gap:7px;flex-wrap:wrap}
      .drink-type-tool{border:1px solid var(--line,#3c3329);background:transparent;color:var(--text-muted,#aaa);border-radius:999px;padding:7px 10px;font:600 10px/1 var(--font-mono,monospace);letter-spacing:.05em;cursor:pointer}
      .drink-type-tool:hover{border-color:var(--gold,#c9a24b);color:var(--text,#fff)}
      .drink-type-tool.alco{color:#ff7070}.drink-type-tool.nonalco{color:#6bb7ff}.drink-type-tool.cold{color:#6dddf4}
      .lapsha-admin-help{margin-top:7px;font-size:11px;line-height:1.5;color:var(--text-muted,#9b9187)}
      .admin-preview-v2{position:fixed;right:18px;bottom:18px;z-index:500;border:1px solid var(--gold,#c9a24b);background:var(--surface,#241c14);color:var(--gold-bright,#e9c877);border-radius:999px;padding:11px 15px;font:700 11px/1 var(--font-body,sans-serif);box-shadow:0 12px 34px rgba(0,0,0,.35);cursor:pointer}
      .admin-preview-v2:hover{transform:translateY(-1px)}
      @media(max-width:720px){.admin-preview-v2{right:12px;bottom:12px;padding:10px 12px}}
    `;
    document.head.appendChild(style);
  }

  function splitTags(value){
    return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);
  }

  function norm(v){return String(v||'').toLowerCase().replace(/[\-_]+/g,' ').replace(/\s+/g,' ').trim();}

  function setupDrinkTypeButtons(){
    const input = document.getElementById('it_mood_tags');
    if(!input || input.dataset.lapshaV2 === '1') return;
    input.dataset.lapshaV2 = '1';

    const tools = document.createElement('div');
    tools.className = 'drink-type-tools';
    const defs = [
      ['ALCO','alco'],
      ['NON ALCO','nonalco'],
      ['ICE','cold'],
      ['COLD','cold']
    ];
    defs.forEach(([tag,cls])=>{
      const b = document.createElement('button');
      b.type='button';
      b.className='drink-type-tool '+cls;
      b.textContent='+ '+tag;
      b.addEventListener('click',()=>{
        const tags = splitTags(input.value);
        if(!tags.some(x=>norm(x)===norm(tag))) tags.push(tag);
        input.value = tags.join(', ');
        input.dispatchEvent(new Event('input',{bubbles:true}));
      });
      tools.appendChild(b);
    });

    const clear = document.createElement('button');
    clear.type='button';
    clear.className='drink-type-tool';
    clear.textContent='Без рамки';
    clear.addEventListener('click',()=>{
      const system = new Set(['alco','alcohol','алко','алкоголь','non alco','non alcohol','без алкоголя','безалкогольный','безалкогольное','ice','cold','лед','со льдом','холодный','холодное']);
      const tags = splitTags(input.value).filter(x=>!system.has(norm(x)));
      input.value = tags.join(', ');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    tools.appendChild(clear);
    input.insertAdjacentElement('afterend',tools);

    const help = document.createElement('div');
    help.className='lapsha-admin-help';
    help.textContent='ALCO — красная рамка, NON ALCO — синяя, ICE/COLD — холодный голубой акцент. Если ничего не выбрать, карточка останется обычной.';
    tools.insertAdjacentElement('afterend',help);
  }

  function addFieldHints(){
    const cat = document.getElementById('cat_description');
    if(cat && !cat.dataset.hintV2){
      cat.dataset.hintV2='1';
      const h=document.createElement('div');
      h.className='lapsha-admin-help';
      h.textContent='Это описание теперь показывается сразу под названием категории (например под «Кофе») как красивый подзаголовок.';
      cat.insertAdjacentElement('afterend',h);
    }
    const news = document.getElementById('news_message');
    if(news && !news.dataset.hintV2){
      news.dataset.hintV2='1';
      const h=document.createElement('div');
      h.className='lapsha-admin-help';
      h.textContent='Можно добавлять сколько угодно новостей. На сайте они показываются крупными карточками со свайпом влево/вправо.';
      news.insertAdjacentElement('afterend',h);
    }
  }

  function addPreview(){
    if(document.querySelector('.admin-preview-v2')) return;
    const b=document.createElement('button');
    b.type='button';
    b.className='admin-preview-v2';
    b.textContent='↗ Предпросмотр сайта';
    b.addEventListener('click',()=>window.open('../index.html','_blank','noopener'));
    document.body.appendChild(b);
  }

  function start(){
    addStyles();
    setupDrinkTypeButtons();
    addFieldHints();
    addPreview();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
