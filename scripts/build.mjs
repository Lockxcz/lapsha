import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const path of ['assets','admpan','index.html','guide.html','training.html','robots.txt','PREVIEW.html'])await cp(path,`dist/${path}`,{recursive:true});
console.log('Public files prepared in dist/');
