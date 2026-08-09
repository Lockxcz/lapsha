(function(){
  'use strict';

  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const BUCKET = window.GUIDE_BUCKET || 'guide-media';

  const $ = (id)=>document.getElementById(id);
  const loginScreen = $('loginScreen');
  const adminShell = $('adminShell');
  const toastEl = $('toast');

  function toast(msg, isError){
    toastEl.textContent = msg;
    toastEl.style.borderColor = isError ? 'var(--danger)' : 'var(--gold)';
    toastEl.classList.add('show');
    setTimeout(()=>toastEl.classList.remove('show'), 3000);
  }

  function publicUrl(path){
    if(!path) return '';
    if(/^https?:\/\//.test(path)) return path;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data ? data.publicUrl : '';
  }

  // HEIC/HEIF (стандартный формат фото на iPhone) браузеры не умеют показывать
  // на сайте — ни на телефоне, ни на компьютере. Ловим это до загрузки.
  function isHeic(file){
    const name = (file.name||'').toLowerCase();
    return /\.(heic|heif)$/.test(name) || /heic|heif/.test(file.type||'');
  }

  // Приводим фото к разумному размеру и формату JPEG перед загрузкой:
  // - убирает вес (быстрее грузится на телефонах гостей/официантов);
  // - канвас всегда рисует картинку с учётом её реальной ориентации,
  //   поэтому вертикальные фото с телефона больше не обрезаются криво.
  function processImage(file, maxSize){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = ()=>{
        let { width, height } = img;
        if(width > maxSize || height > maxSize){
          if(width > height){ height = Math.round(height * maxSize/width); width = maxSize; }
          else { width = Math.round(width * maxSize/height); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob=>{
          URL.revokeObjectURL(url);
          if(!blob){ reject(new Error('Не удалось обработать изображение')); return; }
          resolve(blob);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('Файл повреждён или формат не поддерживается браузером')); };
      img.src = url;
    });
  }

  async function uploadFile(file, prefix){
    if(isHeic(file)){
      toast('Это HEIC-фото (формат iPhone) — браузеры его не показывают. На iPhone: Настройки → Камера → Форматы → «Наиболее совместимые», затем переснимите/пересохраните фото и загрузите заново.', true);
      throw new Error('HEIC not supported');
    }
    let blob = file, ext = 'jpg';
    try{
      blob = await processImage(file, 1600);
    }catch(err){
      toast('Не удалось обработать фото: '+err.message, true);
      throw err;
    }
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert:false, contentType:'image/jpeg' });
    if(error){ toast('Ошибка загрузки файла: '+error.message, true); throw error; }
    return path;
  }

  // ============================================================
  // AUTH
  // ============================================================
  async function checkSession(){
    const { data:{ session } } = await sb.auth.getSession();
    if(session){ showDashboard(); } else { showLogin(); }
  }

  function showLogin(){ loginScreen.style.display='flex'; adminShell.style.display='none'; }
  function showDashboard(){
    loginScreen.style.display='none'; adminShell.style.display='flex';
    loadSettingsView();
    loadCategoriesView();
    loadItemsView();
  }

  $('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    $('loginError').textContent = '';
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if(error){ $('loginError').textContent = 'Неверный email или пароль.'; return; }
    showDashboard();
  });

  $('logoutBtn').addEventListener('click', async ()=>{
    await sb.auth.signOut();
    showLogin();
  });

  // ============================================================
  // NAVIGATION
  // ============================================================
  document.querySelectorAll('.side-link[data-view]').forEach(link=>{
    link.addEventListener('click', ()=>{
      document.querySelectorAll('.side-link[data-view]').forEach(l=>l.classList.remove('active'));
      link.classList.add('active');
      ['settings','categories','items','import'].forEach(v=>{
        $('view-'+v).style.display = (v===link.dataset.view) ? '' : 'none';
      });
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn=>{
    btn.addEventListener('click', ()=> $(btn.dataset.closeModal).classList.remove('show'));
  });

  // ============================================================
  // SETTINGS
  // ============================================================
  let currentLogoPath = null;

  async function loadSettingsView(){
    const { data } = await sb.from('settings').select('*').eq('id',1).single();
    if(!data) return;
    $('s_site_title').value = data.site_title||'';
    $('s_hero_eyebrow').value = data.hero_eyebrow||'';
    $('s_hero_subtitle').value = data.hero_subtitle||'';
    $('s_hero_title').value = data.hero_title||'';
    $('s_hero_quote').value = data.hero_quote||'';
    $('c_bg').value = data.color_bg||'#15100c';
    $('c_surface').value = data.color_surface||'#241c14';
    $('c_gold').value = data.color_gold||'#c9a24b';
    $('c_gold_bright').value = data.color_gold_bright||'#e9c877';
    $('c_text').value = data.color_text||'#f1e8d8';
    $('c_text_muted').value = data.color_text_muted||'#a89a86';
    currentLogoPath = data.logo_url || null;
    $('logoPreview').src = currentLogoPath ? publicUrl(currentLogoPath) : '';
  }

  $('logoFile').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    $('logoPreview').src = URL.createObjectURL(file);
    try{
      currentLogoPath = await uploadFile(file, 'branding');
      toast('Логотип загружен, не забудьте сохранить настройки');
    }catch(_){}
  });

  $('saveSettingsBtn').addEventListener('click', async ()=>{
    const payload = {
      site_title: $('s_site_title').value.trim(),
      hero_eyebrow: $('s_hero_eyebrow').value.trim(),
      hero_subtitle: $('s_hero_subtitle').value.trim(),
      hero_title: $('s_hero_title').value.trim(),
      hero_quote: $('s_hero_quote').value.trim(),
      color_bg: $('c_bg').value, color_surface: $('c_surface').value,
      color_gold: $('c_gold').value, color_gold_bright: $('c_gold_bright').value,
      color_text: $('c_text').value, color_text_muted: $('c_text_muted').value,
      logo_url: currentLogoPath,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from('settings').update(payload).eq('id',1);
    if(error){ toast('Ошибка сохранения: '+error.message, true); return; }
    $('settingsOk').textContent = 'Сохранено ✓';
    setTimeout(()=> $('settingsOk').textContent='', 2500);
    toast('Настройки сохранены');
  });

  // ============================================================
  // CATEGORIES
  // ============================================================
  async function loadCategoriesView(){
    const { data } = await sb.from('categories').select('*').order('sort_order');
    const tbody = $('categoriesTable');
    tbody.innerHTML = '';
    (data||[]).forEach(cat=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${cat.sort_order}</td><td>${esc(cat.title)}</td><td><code>${esc(cat.slug)}</code></td>
        <td><span class="badge ${cat.published?'on':'off'}">${cat.published?'Виден':'Скрыт'}</span></td>
        <td class="actions"><button class="btn small secondary" data-edit-cat="${cat.id}">Изменить</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-edit-cat]').forEach(btn=>{
      btn.addEventListener('click', ()=> openCategoryModal(btn.dataset.editCat, data));
    });
    populateCategorySelects(data||[]);
  }

  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function openCategoryModal(id, allCats){
    const cat = id ? (allCats||[]).find(c=>c.id===id) : null;
    $('categoryModalTitle').textContent = cat ? 'Изменить категорию' : 'Новая категория';
    $('cat_id').value = cat ? cat.id : '';
    $('cat_title').value = cat ? cat.title : '';
    $('cat_slug').value = cat ? cat.slug : '';
    $('cat_icon').value = cat ? cat.icon : 'coffee';
    $('cat_description').value = cat ? cat.description||'' : '';
    $('cat_staff_tip').value = cat ? cat.staff_tip||'' : '';
    $('cat_sort_order').value = cat ? cat.sort_order : 0;
    $('cat_published').checked = cat ? cat.published : true;
    $('deleteCategoryBtn').style.display = cat ? 'inline-flex' : 'none';
    $('categoryModal').classList.add('show');
  }

  $('addCategoryBtn').addEventListener('click', ()=> openCategoryModal(null, []));

  $('saveCategoryBtn').addEventListener('click', async ()=>{
    const id = $('cat_id').value;
    const payload = {
      title: $('cat_title').value.trim(),
      slug: $('cat_slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-'),
      icon: $('cat_icon').value,
      description: $('cat_description').value.trim(),
      staff_tip: $('cat_staff_tip').value.trim(),
      sort_order: parseInt($('cat_sort_order').value||'0',10),
      published: $('cat_published').checked,
    };
    if(!payload.title || !payload.slug){ toast('Заполните название и ярлык', true); return; }
    const { error } = id
      ? await sb.from('categories').update(payload).eq('id', id)
      : await sb.from('categories').insert(payload);
    if(error){ toast('Ошибка: '+error.message, true); return; }
    $('categoryModal').classList.remove('show');
    toast('Категория сохранена');
    loadCategoriesView();
  });

  $('deleteCategoryBtn').addEventListener('click', async ()=>{
    const id = $('cat_id').value;
    if(!id) return;
    if(!confirm('Удалить категорию и все её напитки? Это действие нельзя отменить.')) return;
    const { error } = await sb.from('categories').delete().eq('id', id);
    if(error){ toast('Ошибка: '+error.message, true); return; }
    $('categoryModal').classList.remove('show');
    toast('Категория удалена');
    loadCategoriesView();
  });

  function populateCategorySelects(cats){
    const opts = cats.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');
    $('it_category_id').innerHTML = opts;
    $('itemsCategorySelect').innerHTML = opts;
    $('it_category_id').addEventListener('change', ()=> populateGroupSelect($('it_category_id').value));
    if(cats.length){
      populateGroupSelect(cats[0].id);
      $('itemsCategorySelect').addEventListener('change', loadItemsTable);
      loadItemsTable();
    }
  }

  async function populateGroupSelect(categoryId){
    const { data } = await sb.from('item_groups').select('*').eq('category_id', categoryId).order('sort_order');
    $('it_group_id').innerHTML = '<option value="">— без группы —</option>' +
      (data||[]).map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join('');
  }

  // ============================================================
  // ITEMS
  // ============================================================
  let currentItemPhotoPath = null;

  async function loadItemsView(){
    // categories already populated via loadCategoriesView -> populateCategorySelects
  }

  async function loadItemsTable(){
    const categoryId = $('itemsCategorySelect').value;
    if(!categoryId){ $('itemsTable').innerHTML=''; return; }
    const [{data:items}, {data:groups}] = await Promise.all([
      sb.from('items').select('*').eq('category_id', categoryId).order('sort_order'),
      sb.from('item_groups').select('*').eq('category_id', categoryId),
    ]);
    const groupTitle = (gid)=> (groups||[]).find(g=>g.id===gid)?.title || '—';
    const tbody = $('itemsTable');
    tbody.innerHTML = (items||[]).map(it=>`
      <tr>
        <td>${it.image_url?`<img class="thumb" src="${publicUrl(it.image_url)}">`:'<span class="badge">нет фото</span>'}</td>
        <td>${esc(it.name)}</td>
        <td>${esc(groupTitle(it.group_id))}</td>
        <td><span class="badge ${it.published?'on':'off'}">${it.published?'Виден':'Скрыт'}</span></td>
        <td class="actions"><button class="btn small secondary" data-edit-item="${it.id}">Изменить</button></td>
      </tr>`).join('') || `<tr><td colspan="5" style="color:var(--text-muted)">В этой категории пока нет напитков.</td></tr>`;
    tbody.querySelectorAll('[data-edit-item]').forEach(btn=>{
      btn.addEventListener('click', ()=> openItemModal((items||[]).find(i=>i.id===btn.dataset.editItem)));
    });
  }

  function openItemModal(item){
    $('itemModalTitle').textContent = item ? 'Изменить напиток' : 'Новый напиток';
    $('it_id').value = item ? item.id : '';
    $('it_name').value = item ? item.name : '';
    $('it_name_en').value = item ? item.name_en||'' : '';
    $('it_teaser').value = item ? item.teaser||'' : '';
    $('it_composition').value = item ? item.composition||'' : '';
    $('it_taste').value = item ? item.taste||'' : '';
    $('it_aroma').value = item ? item.aroma||'' : '';
    $('it_aftertaste').value = item ? item.aftertaste||'' : '';
    $('it_who_for').value = item ? item.who_for||'' : '';
    $('it_presentation').value = item ? item.presentation||'' : '';
    $('it_fact').value = item ? item.fact||'' : '';
    $('it_pairing').value = item ? item.pairing||'' : '';
    $('it_mood_tags').value = item ? (item.mood_tags||[]).join(', ') : '';
    $('it_price').value = item ? item.price||'' : '';
    $('it_sort_order').value = item ? item.sort_order : 0;
    $('it_published').checked = item ? item.published : true;
    currentItemPhotoPath = item ? item.image_url : null;
    $('itemPhotoPreview').src = currentItemPhotoPath ? publicUrl(currentItemPhotoPath) : '';
    $('it_category_id').value = item ? item.category_id : $('itemsCategorySelect').value;
    populateGroupSelect($('it_category_id').value).then(()=>{
      $('it_group_id').value = item && item.group_id ? item.group_id : '';
    });
    $('deleteItemBtn').style.display = item ? 'inline-flex' : 'none';
    $('itemModal').classList.add('show');
  }

  $('addItemBtn').addEventListener('click', ()=>{
    if(!$('itemsCategorySelect').value){ toast('Сначала создайте категорию', true); return; }
    openItemModal(null);
  });

  $('itemPhotoFile').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    $('itemPhotoPreview').src = URL.createObjectURL(file);
    try{
      currentItemPhotoPath = await uploadFile(file, 'items');
      toast('Фото загружено, не забудьте сохранить');
    }catch(_){}
  });

  $('saveItemBtn').addEventListener('click', async ()=>{
    const id = $('it_id').value;
    const moodTags = $('it_mood_tags').value.split(',').map(s=>s.trim()).filter(Boolean);
    const payload = {
      category_id: $('it_category_id').value,
      group_id: $('it_group_id').value || null,
      name: $('it_name').value.trim(),
      name_en: $('it_name_en').value.trim(),
      teaser: $('it_teaser').value.trim(),
      composition: $('it_composition').value.trim(),
      taste: $('it_taste').value.trim(),
      aroma: $('it_aroma').value.trim(),
      aftertaste: $('it_aftertaste').value.trim(),
      who_for: $('it_who_for').value.trim(),
      presentation: $('it_presentation').value.trim(),
      fact: $('it_fact').value.trim(),
      pairing: $('it_pairing').value.trim(),
      mood_tags: moodTags,
      price: $('it_price').value.trim(),
      image_url: currentItemPhotoPath,
      sort_order: parseInt($('it_sort_order').value||'0',10),
      published: $('it_published').checked,
    };
    if(!payload.name || !payload.category_id){ toast('Заполните название и категорию', true); return; }
    const { error } = id
      ? await sb.from('items').update(payload).eq('id', id)
      : await sb.from('items').insert(payload);
    if(error){ toast('Ошибка: '+error.message, true); return; }
    $('itemModal').classList.remove('show');
    toast('Напиток сохранён');
    loadItemsTable();
  });

  $('deleteItemBtn').addEventListener('click', async ()=>{
    const id = $('it_id').value;
    if(!id) return;
    if(!confirm('Удалить этот напиток?')) return;
    const { error } = await sb.from('items').delete().eq('id', id);
    if(error){ toast('Ошибка: '+error.message, true); return; }
    $('itemModal').classList.remove('show');
    toast('Напиток удалён');
    loadItemsTable();
  });

  // ============================================================
  // IMPORT (bulk items from JSON — e.g. generated from the PDF guide)
  // ============================================================
  const importLog = $('importLog');
  function logLine(msg, isError){
    const row = document.createElement('div');
    row.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
    row.textContent = msg;
    importLog.appendChild(row);
    importLog.scrollTop = importLog.scrollHeight;
  }

  $('importFile').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=> { $('importJson').value = reader.result; };
    reader.readAsText(file);
  });

  $('runImportBtn').addEventListener('click', async ()=>{
    importLog.innerHTML = '';
    $('importOk').textContent = '';
    let payload;
    try{
      payload = JSON.parse($('importJson').value);
    }catch(err){
      toast('Файл не является корректным JSON: '+err.message, true);
      return;
    }
    const rows = Array.isArray(payload) ? payload : (payload.items || []);
    if(!rows.length){ toast('В файле нет напитков для импорта (ожидается массив items)', true); return; }

    $('runImportBtn').disabled = true;
    logLine(`Найдено позиций: ${rows.length}. Начинаю импорт...`);

    const { data: allCats } = await sb.from('categories').select('id,slug,title');
    const catBySlug = {};
    (allCats||[]).forEach(c=> catBySlug[c.slug] = c);

    const groupCache = {}; // key: categoryId + '::' + title -> group id

    async function getOrCreateGroup(categoryId, title){
      if(!title) return null;
      const key = categoryId + '::' + title;
      if(groupCache[key]) return groupCache[key];
      const { data: existing } = await sb.from('item_groups').select('id').eq('category_id', categoryId).eq('title', title).maybeSingle();
      if(existing){ groupCache[key] = existing.id; return existing.id; }
      const { data: created, error } = await sb.from('item_groups').insert({ category_id: categoryId, title, sort_order: 0 }).select('id').single();
      if(error){ throw error; }
      groupCache[key] = created.id;
      return created.id;
    }

    let ok = 0, failed = 0, skipped = 0;
    for(const row of rows){
      const slug = row.category_slug || row.category || '';
      const cat = catBySlug[slug];
      if(!cat){
        logLine(`✕ Пропущено «${row.name||'(без имени)'}» — категория «${slug}» не найдена. Создайте её на вкладке «Категории».`, true);
        skipped++; continue;
      }
      if(!row.name){
        logLine(`✕ Пропущена строка без названия`, true);
        skipped++; continue;
      }
      try{
        const groupId = row.group_title ? await getOrCreateGroup(cat.id, row.group_title) : null;
        const item = {
          category_id: cat.id,
          group_id: groupId,
          name: row.name,
          name_en: row.name_en || '',
          teaser: row.teaser || '',
          composition: row.composition || '',
          taste: row.taste || '',
          aroma: row.aroma || '',
          aftertaste: row.aftertaste || '',
          who_for: row.who_for || '',
          presentation: row.presentation || '',
          fact: row.fact || '',
          pairing: row.pairing || '',
          country: row.country || '',
          price: row.price || '',
          mood_tags: Array.isArray(row.mood_tags) ? row.mood_tags : (row.mood_tags ? String(row.mood_tags).split(',').map(s=>s.trim()).filter(Boolean) : []),
          sort_order: row.sort_order || 0,
          published: row.published !== false,
        };
        const { error } = await sb.from('items').insert(item);
        if(error) throw error;
        ok++;
      }catch(err){
        logLine(`✕ Ошибка при добавлении «${row.name}»: ${err.message}`, true);
        failed++;
      }
    }

    logLine(`Готово: добавлено ${ok}, пропущено ${skipped}, ошибок ${failed}.`);
    $('importOk').textContent = `Импорт завершён: ${ok} добавлено`;
    $('runImportBtn').disabled = false;
    toast(`Импорт завершён: добавлено ${ok} из ${rows.length}`);
    loadItemsTable();
  });

  checkSession();
})();
