(function(){
'use strict';
const {sb,toast,populateGroupSelect,loadItemsTable}=window.GuideAdmin;
const {esc,normalize}=window.GuideUI;
const $=id=>document.getElementById(id);
let groups=[],groupRequest=0;
async function loadGroups(){
 const cat=$('groupsCategory').value,request=++groupRequest;
 if(!cat){$('groupsList').textContent='Сначала создайте категорию.';return;}
 $('groupsList').textContent='Загружаем подкатегории…';
 const {data,error}=await sb.from('item_groups').select('*').eq('category_id',cat).order('sort_order');
 if(request!==groupRequest)return;
 if(error){$('groupsList').textContent='Не удалось загрузить: '+error.message;return;}
 groups=data||[];
 $('groupsList').innerHTML=groups.map(g=>`<div class="group-admin-row"><div><strong>${esc(g.title)}</strong><p>${esc(g.description||'Описание не добавлено')}</p></div><button type="button" class="btn secondary" data-edit-group="${esc(g.id)}">Изменить</button><button type="button" class="btn danger" data-delete-group="${esc(g.id)}">Удалить</button></div>`).join('')||'Подкатегорий пока нет.';
 $('groupsList').querySelectorAll('[data-edit-group]').forEach(b=>b.onclick=()=>edit(groups.find(g=>g.id===b.dataset.editGroup)));
 $('groupsList').querySelectorAll('[data-delete-group]').forEach(b=>b.onclick=async()=>{
  if(!confirm('Удалить подкатегорию? Её напитки останутся в основной категории.'))return;
  b.disabled=true;
  const {error}=await sb.from('item_groups').delete().eq('id',b.dataset.deleteGroup);
  if(error){toast(error.message,true);b.disabled=false;return;}
  toast('Подкатегория удалена, напитки сохранены');loadGroups();populateGroupSelect($('it_category_id').value);loadItemsTable();
 });
}
function edit(group){
 if(!$('groupsCategory').value){toast('Сначала выберите категорию',true);return;}
 $('groupId').value=group?.id||'';$('groupTitle').value=group?.title||'';$('groupDescription').value=group?.description||'';$('groupMode').value=group?.description_mode||'collapse';$('groupOrder').value=group?.sort_order||0;$('groupStatus').textContent='';$('groupEditor').hidden=false;$('groupTitle').focus();
}
const syncCategories=e=>{const previous=$('groupsCategory').value;$('groupsCategory').innerHTML=e.detail.map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');if(e.detail.some(c=>c.id===previous))$('groupsCategory').value=previous;loadGroups();};
document.addEventListener('admin:categories',syncCategories);
if(window.GuideAdmin.categories)syncCategories({detail:window.GuideAdmin.categories});
$('groupsCategory').onchange=()=>{$('groupEditor').hidden=true;loadGroups();};
$('newGroup').onclick=()=>edit(null);$('cancelGroup').onclick=()=>{$('groupEditor').hidden=true;dirty.delete('groupEditor');};
$('groupEditor').onsubmit=async e=>{
 e.preventDefault();const payload={category_id:$('groupsCategory').value,title:$('groupTitle').value.trim(),description:$('groupDescription').value.trim(),description_mode:$('groupMode').value,sort_order:Number($('groupOrder').value||0)};
 if(!payload.title){toast('Введите название',true);return;}
 $('saveGroup').disabled=true;
 try{
  const id=$('groupId').value;
  const {error}=id?await sb.from('item_groups').update(payload).eq('id',id):await sb.from('item_groups').insert(payload);
  if(error)throw error;
  dirty.delete('groupEditor');$('groupEditor').hidden=true;toast('Подкатегория сохранена');await loadGroups();populateGroupSelect($('it_category_id').value);loadItemsTable();
 }catch(error){$('groupStatus').textContent='Не удалось сохранить: '+error.message+'. Если поле не найдено, выполните update-v4.sql.';}
 finally{$('saveGroup').disabled=false;}
};
// A quick filter affects only the loaded admin table, never the published data.
function filterItems(){
 const q=normalize($('adminItemSearch').value),status=$('adminItemStatus').value;
 const rows=[...$('itemsTable').querySelectorAll('tr')];let count=0;
 rows.forEach(row=>{const isItem=!!row.querySelector('[data-edit-item]');const match=isItem&&(!q||normalize(row.textContent).includes(q))&&(!status||row.querySelector('.badge.'+status));row.hidden=isItem?!match:false;if(match)count++;});
 $('adminItemCount').textContent=`Найдено напитков: ${count}`;
}
$('adminItemSearch').oninput=filterItems;$('adminItemStatus').onchange=filterItems;
new MutationObserver(filterItems).observe($('itemsTable'),{childList:true});
// Preview width can be changed without losing the current unsaved inputs.
for(const id of ['cat_preview','it_preview','news_preview']){
 const preview=$(id);const controls=document.createElement('div');controls.className='preview-sizes';controls.innerHTML='<span>Ширина:</span><button type="button" data-width="320">320</button><button type="button" data-width="390">390</button><button type="button" data-width="full" aria-pressed="true">Вся</button>';
 preview.before(controls);controls.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.width==='full'));b.onclick=()=>{preview.style.width=b.dataset.width==='full'?'100%':b.dataset.width+'px';preview.style.maxWidth='100%';controls.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};});
}
const counterPaints=[];
document.querySelectorAll('textarea:not(#importJson)').forEach(input=>{const counter=document.createElement('small');counter.className='field-count';input.after(counter);const paint=()=>counter.textContent=`${input.value.length} символов`;input.addEventListener('input',paint);counterPaints.push(paint);paint();});
for(const id of ['categoryModal','itemModal','newsModal','groupEditor'])new MutationObserver(()=>counterPaints.forEach(paint=>paint())).observe($(id),{attributes:true,attributeFilter:['class','hidden']});
// Warn before leaving unsaved changes; successful saves close modals and clear flags.
const dirty=new Set();
for(const id of ['categoryModal','itemModal','newsModal','groupEditor','view-settings']){
 const el=$(id);el.addEventListener('input',()=>dirty.add(id));
 if(id.endsWith('Modal'))new MutationObserver(()=>{if(!el.classList.contains('show'))dirty.delete(id);}).observe(el,{attributes:true,attributeFilter:['class']});
}
new MutationObserver(()=>{if($('settingsOk').textContent)dirty.delete('view-settings');}).observe($('settingsOk'),{childList:true});
window.addEventListener('beforeunload',e=>{if(dirty.size){e.preventDefault();e.returnValue='';}});
document.addEventListener('click',e=>{const close=e.target.closest('[data-close-modal]');if(close&&dirty.has(close.dataset.closeModal)&&!confirm('Закрыть без сохранения изменений?')){e.preventDefault();e.stopImmediatePropagation();}},true);
})();
