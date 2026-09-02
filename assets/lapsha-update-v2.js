/* LAPSHA Guide Update v2 */
(function(){
  'use strict';

  const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  const LEFT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"></path></svg>';
  const RIGHT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"></path></svg>';

  function normalize(s){
    return String(s || '')
      .toLowerCase()
      .replace(/ё/g,'е')
      .replace(/[\-_]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function isSystemTag(tag){
    const t = normalize(tag);
    return t === 'alco' || t === 'alcohol' || t === 'алко' || t === 'алкоголь' ||
      t === 'non alco' || t === 'non alcohol' || t === 'без алкоголя' || t === 'безалкогольный' || t === 'безалкогольное' ||
      t === 'ice' || t === 'cold' || t === 'лед' || t === 'со льдом' || t === 'холодный' || t === 'холодное';
  }

  function classifyCards(root){
    (root || document).querySelectorAll('.card[data-search]').forEach(card=>{
      if(card.dataset.lapshaDecorated === '1') return;
      const tagEls = Array.from(card.querySelectorAll('.tag[data-tag]'));
      const tags = tagEls.map(el=>normalize(el.dataset.tag || el.textContent));
      const joined = ' ' + tags.join(' | ') + ' ';

      const nonalco = tags.some(t=>[
        'non alco','non alcohol','без алкоголя','безалкогольный','безалкогольное','0%','0 %'
      ].includes(t));
      const alco = !nonalco && tags.some(t=>[
        'alco','alcohol','алко','алкоголь','алкогольный','алкогольное'
      ].includes(t));
      const cold = tags.some(t=>[
        'ice','cold','лед','со льдом','холодный','холодное'
      ].includes(t));

      if(alco) card.classList.add('drink-alco');
      if(nonalco) card.classList.add('drink-nonalco');
      if(cold) card.classList.add('drink-cold');

      tagEls.forEach(el=>{
        if(isSystemTag(el.dataset.tag || el.textContent)) el.classList.add('system-drink-tag');
      });

      if(alco || nonalco || cold){
        const flags = document.createElement('div');
        flags.className = 'drink-flags';
        if(alco) flags.insertAdjacentHTML('beforeend','<span class="drink-flag alco">ALCO</span>');
        if(nonalco) flags.insertAdjacentHTML('beforeend','<span class="drink-flag nonalco">NON ALCO</span>');
        if(cold) flags.insertAdjacentHTML('beforeend','<span class="drink-flag cold">ICE / COLD</span>');

        const photo = card.querySelector('.card-photo-wrap');
        if(photo) photo.appendChild(flags);
        else card.prepend(flags);
      }

      card.dataset.lapshaDecorated = '1';
    });
  }

  async function buildNewsV2(){
    const ticker = document.getElementById('newsTicker');
    if(!ticker || ticker.dataset.lapshaV2 === '1') return;
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;

    try{
      const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data, error } = await client
        .from('news')
        .select('*')
        .eq('published', true)
        .order('sort_order')
        .order('created_at', { ascending:false });
      if(error || !data || !data.length) return;

      ticker.dataset.lapshaV2 = '1';
      ticker.className = 'news-ticker lapsha-news-v2 show';
      ticker.innerHTML = '';

      const shell = document.createElement('div');
      shell.className = 'lapsha-news-shell';
      shell.innerHTML = `
        <div class="lapsha-news-head">
          <div class="lapsha-news-title-wrap">
            <span class="lapsha-news-kicker">Обновления меню</span>
            <h2 class="lapsha-news-title">Новости</h2>
            <p class="lapsha-news-subtitle">Листайте влево и вправо — здесь собраны актуальные изменения, новые позиции и важные заметки для команды.</p>
          </div>
          <div class="lapsha-news-controls">
            <button class="lapsha-news-btn prev" type="button" aria-label="Предыдущая новость">${LEFT_ICON}</button>
            <button class="lapsha-news-btn next" type="button" aria-label="Следующая новость">${RIGHT_ICON}</button>
          </div>
        </div>
        <div class="lapsha-news-viewport" tabindex="0" aria-label="Новости. Листайте горизонтально">
          <div class="lapsha-news-track"></div>
        </div>
        <div class="lapsha-news-count"></div>`;
      ticker.appendChild(shell);

      const viewport = shell.querySelector('.lapsha-news-viewport');
      const track = shell.querySelector('.lapsha-news-track');
      const count = shell.querySelector('.lapsha-news-count');

      data.forEach((n, idx)=>{
        const card = document.createElement('article');
        card.className = 'lapsha-news-card';
        const date = n.created_at ? new Date(n.created_at).toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'}) : '';

        const meta = document.createElement('div');
        meta.className = 'lapsha-news-meta';
        const index = document.createElement('span');
        index.className = 'lapsha-news-index';
        index.textContent = `Новость ${String(idx+1).padStart(2,'0')}`;
        const dateEl = document.createElement('span');
        dateEl.className = 'lapsha-news-date';
        dateEl.textContent = date;
        meta.append(index,dateEl);

        const message = document.createElement('p');
        message.className = 'lapsha-news-message';
        message.textContent = n.message || '';
        card.append(meta,message);
        track.appendChild(card);
      });

      count.textContent = `${data.length} ${pluralizeNews(data.length)} · свайп влево / вправо`;

      function step(dir){
        const card = track.querySelector('.lapsha-news-card');
        const gap = 14;
        const amount = card ? card.getBoundingClientRect().width + gap : viewport.clientWidth * .85;
        viewport.scrollBy({left:dir * amount,behavior:'smooth'});
      }
      shell.querySelector('.prev').addEventListener('click',()=>step(-1));
      shell.querySelector('.next').addEventListener('click',()=>step(1));
      viewport.addEventListener('keydown',e=>{
        if(e.key === 'ArrowLeft'){e.preventDefault();step(-1);}
        if(e.key === 'ArrowRight'){e.preventDefault();step(1);}
      });
    }catch(err){
      console.warn('[LAPSHA v2] news enhancement skipped',err);
    }
  }

  function pluralizeNews(n){
    const m10 = n % 10, m100 = n % 100;
    if(m10 === 1 && m100 !== 11) return 'новость';
    if(m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'новости';
    return 'новостей';
  }

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
          const group = card.closest('.spirit-group')?.querySelector('h4')?.textContent?.trim() || '';
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
      let found = q ? all.filter(x=>x.hay.includes(q)) : all.filter(x=>x.type==='drink');
      found = found.slice(0,24);
      results.innerHTML = '';

      if(!found.length){
        const empty = document.createElement('div');
        empty.className = 'quick-find-empty';
        empty.textContent = 'Ничего не найдено. Попробуйте название, вкус, состав или категорию.';
        results.appendChild(empty);
        return;
      }

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
      const target = item.target;
      if(!target || !target.isConnected) return;
      target.scrollIntoView({behavior:'smooth',block:'center'});
      if(item.type === 'drink'){
        const details = target.querySelector('details');
        if(details) details.open = true;
        target.classList.remove('quick-find-hit');
        void target.offsetWidth;
        target.classList.add('quick-find-hit');
        setTimeout(()=>target.classList.remove('quick-find-hit'),1800);
      }
    }

    function open(){
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

  function observeCards(){
    const main = document.getElementById('sections');
    if(!main) return;
    classifyCards(main);
    const mo = new MutationObserver(()=>classifyCards(main));
    mo.observe(main,{childList:true,subtree:true});
  }

  function start(){
    createQuickFind();
    observeCards();
    buildNewsV2();

    // app.js loads content asynchronously; retry news once if the first request raced page init
    setTimeout(buildNewsV2,700);
    setTimeout(()=>classifyCards(document),900);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
