(function(){'use strict';
const clean=s=>String(s||'').trim(),key=s=>clean(s).toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
function shuffle(list,random=Math.random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function build(data,custom=[]){const bank=[],fields=[['composition','Какой состав указан для'],['country','Какая страна указана для'],['taste','Какой вкус описан у'],['aroma','Какой аромат описан у'],['pairing','Какое сочетание с едой указано для']];
 for(const cat of data.categories){const items=data.items.filter(i=>i.category_id===cat.id);for(const [field,prompt] of fields){const values=[...new Map(items.map(i=>[key(i[field]),clean(i[field])]).filter(([k,v])=>k&&v.length<=400)).values()];if(values.length<4)continue;for(const item of items){const answer=clean(item[field]);if(items.filter(i=>key(i.name)===key(item.name)).length!==1)continue;if(!answer||answer.length>400)continue;const wrong=shuffle(values.filter(v=>key(v)!==key(answer))).slice(0,3);if(wrong.length!==3)continue;bank.push({id:item.id+':'+field,category_id:cat.id,item_id:item.id,question:prompt+' «'+item.name+'»?',options:[answer,...wrong],correct_index:0,explanation:'В карточке «'+item.name+'»: '+answer,source:'menu'});}}
 }
 for(const q of custom){if(q.published&&Array.isArray(q.options)&&q.options.length===4&&new Set(q.options.map(key)).size===4&&q.correct_index>=0&&q.correct_index<4)bank.push({...q,source:'editor'});}
 return bank;
}
function prepare(question){const choices=shuffle(question.options.map((text,index)=>({text,correct:index===question.correct_index})));return {...question,choices};}
window.QuizEngine={build,shuffle,prepare,key};
})();
