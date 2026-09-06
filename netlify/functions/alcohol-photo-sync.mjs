import {synchronize} from '../../server/sync.mjs';
export default async () => {
 try {const result=await synchronize(process.env);console.log('Alcohol photo sync',JSON.stringify(result));return new Response(null,{status:204});}
 catch(error){console.error('Alcohol photo sync:',error.message);return new Response('Sync unavailable',{status:500});}
};
export const config={schedule:'*/2 * * * *'};
