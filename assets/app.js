(function(){
  'use strict';

  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const mainEl = document.getElementById('sections');
  const tocEl = document.getElementById('toc');
  const chipsEl = document.getElementById('chips');
  const searchInput = document.getElementById('search');
  const noResults = document.getElementById('noResults');
  const filterBar = document.getElementById('filterBar');
  const activeTagLabel = document.getElementById('activeTagLabel');
  const clearFilterBtn = document.getElementById('clearFilter');

  let activeTag = null;
  let favoritesOnly=false;
  let favorites=new Set();
  try{const saved=JSON.parse(localStorage.getItem('lapsha-favorites-v3')||'[]');if(Array.isArray(saved))favorites=new Set(saved);}catch{}



  function publicUrl(path){
    if(!path) return '';
    if(/^https?:\/\//.test(path)) return path;
    const { data } = sb.storage.from(window.GUIDE_BUCKET).getPublicUrl(path);
    return data ? data.publicUrl : '';
  }

  async function loadSettings(){
    const { data } = await sb.from('settings').select('*').eq('id',1).single();
    if(!data) return;
    const root = document.documentElement.style;
    root.setProperty('--bg', data.color_bg);
    root.setProperty('--surface', data.color_surface);
    root.setProperty('--gold', data.color_gold);
    root.setProperty('--gold-bright', data.color_gold_bright);
    root.setProperty('--text', data.color_text);
    root.setProperty('--text-muted', data.color_text_muted);
    if(data.font_heading) root.setProperty('--font-head', `'${data.font_heading}', serif`);
    if(data.font_body) root.setProperty('--font-body', `'${data.font_body}', sans-serif`);

    document.title = data.site_title || 'Гид по барному меню';
    document.getElementById('heroEyebrow').textContent = data.hero_eyebrow || '';
    document.getElementById('heroTitle').innerHTML = esc(data.hero_title || '').replace(/&lt;(\/?em)&gt;/g,'<$1>');
    document.getElementById('heroSubtitle').textContent = data.hero_subtitle || '';
    document.getElementById('heroQuote').textContent = data.hero_quote ? `«${data.hero_quote}»` : '';

    const brand = document.getElementById('navBrand');
    const logoBox = document.getElementById('heroLogo');
    if(data.logo_url){
      const url = publicUrl(data.logo_url);
      brand.innerHTML = `<img src="${esc(url)}" alt="Логотип">${esc(data.site_title||'')}`;
      logoBox.innerHTML = `<img class="hero-logo" src="${esc(url)}" alt="${esc(data.site_title||'Логотип')}">`;
    } else {
      brand.innerHTML = `<span class="ring"></span>${esc(data.site_title||'Гид')}`;
      logoBox.innerHTML = `<div class="hero-logo placeholder">${esc(data.site_title||'ГИД')}</div>`;
    }
    if(data.favicon_url){
      let link = document.querySelector("link[rel~='icon']");
      if(!link){ link = document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
      link.href = publicUrl(data.favicon_url);
    }
  }

  async function loadNews(){
    const {data,error}=await sb.from('news').select('*').eq('published',true).order('sort_order').order('created_at',{ascending:false});
    if(error) throw error;
    window.GuideUI.renderNews(document.getElementById('newsTicker'),data||[]);
  }

  const {cardHTML: renderCard, sectionHead, normalize, esc} = window.GuideUI;
  const cardHTML = item=>renderCard(item,publicUrl);
  function tipHTML(tip){
    if(!tip) return '';
    return `<div class="staff-tip"><span class="lbl">Совет официанту</span>${esc(tip)}</div>`;
  }

  async function loadContent(){
    const responses = await Promise.all([
      sb.from('categories').select('*').eq('published',true).order('sort_order'),
      sb.from('item_groups').select('*').order('sort_order'),
      sb.from('items').select('*').eq('published',true).order('sort_order'),
    ]);
    const failure=responses.find(r=>r.error); if(failure) throw failure.error;
    const [cats,groups,items]=responses.map(r=>r.data||[]);

    const groupsByCat = {};
    (groups||[]).forEach(g=>{ (groupsByCat[g.category_id] ||= []).push(g); });
    const itemsByCat = {};
    (items||[]).forEach(it=>{ (itemsByCat[it.category_id] ||= []).push(it); });

    mainEl.innerHTML = '';
    tocEl.innerHTML = '';
    chipsEl.innerHTML = `<button class="chip active" data-target="top">Все</button>`;

    cats.forEach((cat, idx)=>{
      cat._num = idx+1;
      const sec = document.createElement('section');
      sec.className = 'section';
      sec.id = cat.slug;
      sec.dataset.cat = cat.slug;

      const catGroups = groupsByCat[cat.id] || [];
      const catItems = itemsByCat[cat.id] || [];

      let body = sectionHead(cat) + tipHTML(cat.staff_tip);

      if(catGroups.length){
        catGroups.forEach(g=>{
          const gi = catItems.filter(it=>it.group_id===g.id);
          if(!gi.length) return;
          body += `<div class="spirit-group"><h4>${esc(g.title)}</h4>${g.description?`<p class="group-desc">${esc(g.description)}</p>`:''}<div class="grid">${gi.map(cardHTML).join('')}</div></div>`;
        });
        const ungrouped = catItems.filter(it=>!catGroups.some(g=>g.id===it.group_id));
        if(ungrouped.length) body += `<div class="grid">${ungrouped.map(cardHTML).join('')}</div>`;
      } else {
        body += catItems.length ? `<div class="grid">${catItems.map(cardHTML).join('')}</div>`
                                 : `<p style="color:var(--text-faint);font-size:14px;">Раздел пока пуст — добавьте напитки в админ-панели.</p>`;
      }

      sec.innerHTML = body;
      mainEl.appendChild(sec);

      tocEl.innerHTML += `<a href="#${cat.slug}"><span class="ring"></span>${esc(cat.title)}</a>`;
      chipsEl.innerHTML += `<button class="chip" data-target="${cat.slug}">${esc(cat.title)}</button>`;
    });

    initInteractions();
    document.dispatchEvent(new Event('guide:ready'));
  }

  function initInteractions(){
    // ---- chip navigation ----
    chipsEl.addEventListener('click', e=>{
      const btn = e.target.closest('.chip');
      if(!btn) return;
      const target = btn.dataset.target;
      if(target === 'top'){ document.getElementById('top').scrollIntoView({behavior:'smooth'}); }
      else { document.getElementById(target).scrollIntoView({behavior:'smooth'}); }
    });

    // ---- scroll-spy ----
    const sections = Array.from(document.querySelectorAll('.section'));
    const chipButtons = Array.from(chipsEl.querySelectorAll('.chip'));
    const spy = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const slug = entry.target.dataset.cat;
          chipButtons.forEach(c=>c.classList.toggle('active', c.dataset.target===slug));
        }
      });
    }, { rootMargin:'-40% 0px -55% 0px', threshold:0 });
    sections.forEach(s=>spy.observe(s));

    // ---- clickable tag filters ----
    mainEl.addEventListener('click', e=>{
      const tagEl = e.target.closest('.tag[data-tag]');
      if(!tagEl) return;
      const tag = tagEl.dataset.tag;
      activeTag = (activeTag === tag) ? null : tag;
      applyFilters();
    });
    clearFilterBtn.addEventListener('click', ()=>{ activeTag = null; applyFilters(); });

    // ---- search ----
    searchInput.addEventListener('input', e=> applyFilters(e.target.value));

    initLightbox();
    initScrollReveal();
    initBackToTop();
  }

  // ---------- LIGHTBOX ----------
  function initLightbox(){
    const lightbox = document.getElementById('lightbox');
    const imgEl = document.getElementById('lightboxImg');
    const captionEl = document.getElementById('lightboxCaption');
    const countEl = document.getElementById('lightboxCount');
    const closeBtn = document.getElementById('lightboxClose');
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    let items = [];
    let idx = -1;
    let lastFocused = null;

    function collect(){
      // only include photos that are currently visible (respects active search/tag filters)
      items = Array.from(document.querySelectorAll('.card-photo-wrap')).filter(w => w.offsetParent !== null);
    }

    function openAt(i){
      collect();
      if(!items.length) return;
      idx = (i + items.length) % items.length;
      const wrap = items[idx];
      const img = wrap.querySelector('img');
      if(!img) return;
      imgEl.src = img.src;
      imgEl.alt = img.alt || '';
      captionEl.textContent = wrap.dataset.caption || img.alt || '';
      const multi = items.length > 1;
      prevBtn.style.display = multi ? 'flex' : 'none';
      nextBtn.style.display = multi ? 'flex' : 'none';
      countEl.textContent = multi ? `${idx+1} / ${items.length}` : '';
      lastFocused = document.activeElement;
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function close(){
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
      imgEl.src = '';
      if(lastFocused && lastFocused.focus) lastFocused.focus();
    }

    mainEl.addEventListener('click', e=>{
      const wrap = e.target.closest('.card-photo-wrap');
      if(!wrap) return;
      collect();
      openAt(items.indexOf(wrap));
    });
    mainEl.addEventListener('keydown', e=>{
      if(e.key !== 'Enter' && e.key !== ' ') return;
      const wrap = e.target.closest('.card-photo-wrap');
      if(!wrap) return;
      e.preventDefault();
      collect();
      openAt(items.indexOf(wrap));
    });

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', ()=> openAt(idx - 1));
    nextBtn.addEventListener('click', ()=> openAt(idx + 1));
    lightbox.addEventListener('click', e=>{ if(e.target === lightbox) close(); });

    document.addEventListener('keydown', e=>{
      if(!lightbox.classList.contains('open')) return;
      if(e.key === 'Escape') close();
      else if(e.key === 'ArrowLeft') openAt(idx - 1);
      else if(e.key === 'ArrowRight') openAt(idx + 1);
    });

    // basic touch swipe
    let touchStartX = null;
    lightbox.addEventListener('touchstart', e=>{ touchStartX = e.changedTouches[0].clientX; }, {passive:true});
    lightbox.addEventListener('touchend', e=>{
      if(touchStartX==null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if(Math.abs(dx) > 50) openAt(dx > 0 ? idx - 1 : idx + 1);
      touchStartX = null;
    }, {passive:true});
  }

  // ---------- SCROLL REVEAL ----------
  function initScrollReveal(){
    const targets = document.querySelectorAll('.card, .spirit-group, .section-head, .staff-tip');
    if(!('IntersectionObserver' in window)){
      targets.forEach(t=>t.classList.add('in-view'));
      return;
    }
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold:0.08, rootMargin:'0px 0px -60px 0px' });
    targets.forEach(t=>io.observe(t));
  }

  // ---------- BACK TO TOP ----------
  function initBackToTop(){
    const btn = document.getElementById('backToTop');
    if(!btn) return;
    window.addEventListener('scroll', ()=>{
      btn.classList.toggle('show', window.scrollY > 500);
    }, {passive:true});
    btn.addEventListener('click', ()=>{
      window.scrollTo({top:0, behavior:'smooth'});
    });
  }

  function applyFilters(query){
    const q = normalize(query!==undefined ? query : searchInput.value);

    if(activeTag){
      filterBar.classList.add('show');
      activeTagLabel.textContent = activeTag;
    } else {
      filterBar.classList.remove('show');
    }

    let anyVisible = false;
    document.querySelectorAll('.section').forEach(sec=>{
      let sectionHasMatch = false;
      const cards = sec.querySelectorAll('.card[data-search]');
      cards.forEach(card=>{
        const hay = normalize((card.dataset.search || '')+' '+sec.querySelector('.section-head').textContent+' '+(card.closest('.spirit-group')?.querySelector('h4')?.textContent||''));
        const tags = (card.dataset.tags || '').split('|');
        const matchesQuery = !q || q.split(' ').every(word=>hay.includes(word));
        const matchesTag = !activeTag || tags.includes(activeTag.toLowerCase());
        const match = matchesQuery && matchesTag && (!favoritesOnly||favorites.has(card.dataset.id));
        card.style.display = match ? '' : 'none';
        if(match) sectionHasMatch = true;
      });
      sec.querySelectorAll('.spirit-group').forEach(group=>{group.style.display=[...group.querySelectorAll('.card')].some(c=>c.style.display!=='none')?'':'none';});
      // sections without cards (spirit lists use plain text, always considered visible unless filtering)
      if(!q && !activeTag && !favoritesOnly){ sec.style.display=''; sectionHasMatch = true; }
      else sec.style.display = sectionHasMatch ? '' : 'none';
      if(sectionHasMatch) anyVisible = true;
    });
    noResults.style.display = ((q||activeTag||favoritesOnly) && !anyVisible) ? 'block' : 'none';
  }

  document.querySelectorAll('.tag').forEach(t=>{
    t.addEventListener('click', ()=>{
      document.querySelectorAll('.tag').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
    });
  });

  document.addEventListener('guide:reset',()=>{activeTag=null;favoritesOnly=false;searchInput.value='';applyFilters();document.getElementById('favoritesOnly')?.setAttribute('aria-pressed','false');});
  document.addEventListener('guide:favorites',e=>{favorites=new Set(e.detail.ids);favoritesOnly=e.detail.only;applyFilters();});
  (async function init(){
    mainEl.textContent='Загружаем меню…';
    try { await loadSettings(); await loadContent(); }
    catch(error){mainEl.innerHTML='<p class="load-error">Не удалось загрузить меню. Проверьте подключение и <a href="">обновите страницу</a>.</p>';console.error(error);}
    try { await loadNews(); } catch(error){console.warn('Новости недоступны',error);}
  })();
})();
