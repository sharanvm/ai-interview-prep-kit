export class HttpError extends Error { constructor(public status:number, public code:string, message:string){super(message);} }
export function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}
export async function withRetry<T>(fn:()=>Promise<T>, attempts=3){let last:any; for(let i=0;i<attempts;i++){try{return await fn();}catch(e){last=e; if(i<attempts-1) await sleep(500*Math.pow(2,i));}} throw last;}
