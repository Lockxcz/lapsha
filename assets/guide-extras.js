(function(){'use strict';const {normalize}=window.GuideUI;
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  const LEFT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"></path></svg>';
  const RIGHT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"></path></svg>';

  function createQuickFind(){
    if(document.querySelector('.quick-find-fab')) return;

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'quick-find-fab';
    fab.setAttribute('aria-label','Быстрый поиск напитка');
    fab.setAttribute('title','Быстрый поиск');
    fab.innerHTML = SEARCH_ICON;

    const overlay = document.createElement('div');
    overlay.className = 'quick-find-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Быстрый поиск');
    overlay.innerHTML = `
      <div class="quick-find-panel">
        <div class="quick-find-head">
          <div class="quick-find-input-wrap">
            ${SEARCH_ICON}
            <input class="quick-find-input" type="search" autocomplete="off" placeholder="Например: эспрессо, маракуйя, виски…">
          </div>
          <button class="quick-find-close" type="button" aria-label="Закрыть">${CLOSE_ICON}</button>
        </div>
        <div class="quick-find-results"></div>
      </div>`;

    document.body.append(fab,overlay);
    const input = overlay.querySelector('.quick-find-input');
    const results = overlay.querySelector('.quick-find-results');
    let previousFocus = null;

    function entries(){
      const out = [];
      document.querySelectorAll('.section').forEach(sec=>{
        const catName = sec.querySelector('.section-head h2')?.textContent?.trim() || '';
        if(catName){
          out.push({
            type:'category',
            name:catName,
            meta:sec.querySelector('.section-desc')?.textContent?.trim() || 'Категория',
            hay:normalize(catName + ' ' + (sec.querySelector('.section-desc')?.textContent || '')),
            target:sec
          });
        }
        sec.querySelectorAll('.card[data-search]').forEach(card=>{
          const name = card.querySelector('h3')?.textContent?.trim() || 'Напиток';
          const group = card.closest('.spirit-group')?.querySelector('.group-heading')?.textContent?.trim() || '';
          const price = card.querySelector('.card-top > .eng')?.textContent?.trim() || '';
          out.push({
            type:'drink',
            name,
            meta:[catName,group,price].filter(Boolean).join(' · '),
            hay:normalize((card.dataset.search || '') + ' ' + name + ' ' + catName + ' ' + group),
            target:card
          });
        });
      });
      return out;
    }

    function render(){
      const q = normalize(input.value);
      const all = entries();
      let found = q ? all.filter(x=>q.split(' ').every(word=>x.hay.includes(word))) : all.filter(x=>x.type==='drink');
      const total=found.length;
      found = found.slice(0,100);
      results.innerHTML = '';

      if(!found.length){
        const empty = document.createElement('div');
        empty.className = 'quick-find-empty';
        empty.textContent = 'Ничего не найдено. Попробуйте название, вкус, состав или категорию.';
        results.appendChild(empty);
        return;
      }

      const count=document.createElement('p'); count.className='quick-find-empty';count.textContent=total>100?`Первые 100 из ${total}. Уточните запрос.`:`Найдено: ${total}`;results.append(count);
      found.forEach(item=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quick-find-result';

        const icon = document.createElement('span');
        icon.className = 'quick-find-icon';
        icon.textContent = item.type === 'category' ? '§' : (item.name.charAt(0).toUpperCase() || '•');
        const text = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'quick-find-name';
        name.textContent = item.name;
        const meta = document.createElement('span');
        meta.className = 'quick-find-meta';
        meta.textContent = item.meta || (item.type === 'category' ? 'Категория' : 'Напиток');
        text.append(name,meta);
        const go = document.createElement('span');
        go.className = 'quick-find-go';
        go.textContent = 'ОТКРЫТЬ →';
        btn.append(icon,text,go);
        btn.addEventListener('click',()=>goTo(item));
        results.appendChild(btn);
      });
    }

    function goTo(item){
      close();
      document.dispatchEvent(new Event('guide:reset'));
      const target = item.target;
      if(!target || !target.isConnected) return;
      target.classList.add('in-view');
      const group=target.closest('.spirit-group'); if(group){group.classList.add('in-view');group.open=true;}
      document.dispatchEvent(new CustomEvent('guide:opened',{detail:target.dataset.id}));
      target.scrollIntoView({behavior:'smooth',block:'center'});
      if(item.type === 'drink'){
        const details = target.querySelector(':scope > details');
        if(details) details.open = true;
        target.classList.remove('quick-find-hit');
        void target.offsetWidth;
        target.classList.add('quick-find-hit');
        setTimeout(()=>target.classList.remove('quick-find-hit'),1800);
      }
    }

    function open(){
      if(overlay.classList.contains('open')) return;
      previousFocus = document.activeElement;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      input.value = '';
      render();
      setTimeout(()=>input.focus(),60);
    }

    function close(){
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      if(previousFocus && previousFocus.focus) previousFocus.focus();
    }

    fab.addEventListener('click',open);
    overlay.querySelector('.quick-find-close').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    input.addEventListener('input',render);
    overlay.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const els=[...overlay.querySelectorAll('input,button')];const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const first = results.querySelector('.quick-find-result');
        if(first) first.click();
      }
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && overlay.classList.contains('open')) close();
      if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
        e.preventDefault();
        open();
      }
    });
  }

createQuickFind();
 function initFavorites(){
  if(document.getElementById('favoritesOnly'))return;
  const cards=[...document.querySelectorAll('#sections .card')];
  let saved=new Set();try{const data=JSON.parse(localStorage.getItem('lapsha-favorites-v3')||'[]');if(Array.isArray(data))saved=new Set(data);}catch{}
  let only=false;
  const bar=document.createElement('div');bar.className='menu-tools';
  bar.innerHTML='<button id="favoritesOnly" type="button" aria-pressed="false">Избранное</button><button id="expandAll" type="button">Раскрыть подробности</button><button id="collapseAll" type="button">Свернуть подробности</button><span id="favoriteCount" role="status"></span>';
  document.getElementById('sections').before(bar);
  const notify=()=>{document.dispatchEvent(new CustomEvent('guide:favorites',{detail:{ids:[...saved],only}}));bar.querySelector('#favoriteCount').textContent=`В избранном: ${cards.filter(c=>saved.has(c.dataset.id)).length}`;};
  cards.forEach(card=>{const button=document.createElement('button');button.type='button';button.className='favorite-toggle';const paint=()=>{const on=saved.has(card.dataset.id);button.textContent=on?'★ В избранном':'☆ В избранное';button.setAttribute('aria-pressed',String(on));};paint();button.onclick=()=>{saved.has(card.dataset.id)?saved.delete(card.dataset.id):saved.add(card.dataset.id);paint();try{localStorage.setItem('lapsha-favorites-v3',JSON.stringify([...saved]));}catch{}notify();};card.append(button);});
  bar.querySelector('#favoritesOnly').onclick=e=>{only=!only;e.currentTarget.setAttribute('aria-pressed',String(only));notify();};
  bar.querySelector('#expandAll').onclick=()=>cards.filter(c=>c.style.display!=='none').forEach(c=>{const d=c.querySelector(':scope > details');if(d)d.open=true;});
  bar.querySelector('#collapseAll').onclick=()=>cards.forEach(c=>{const d=c.querySelector(':scope > details');if(d)d.open=false;});
  document.addEventListener('guide:reset',()=>{only=false;bar.querySelector('#favoritesOnly').setAttribute('aria-pressed','false');});
  notify();
 }
 document.addEventListener('guide:ready',initFavorites);
 if(window.GuideReady)initFavorites();
})();