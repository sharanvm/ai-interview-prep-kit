import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { env } from "../config/env";
import { withRetry } from "../lib/http";
import dns from "node:dns/promises";
import net from "node:net";

export interface Page { url:string; title:string; text:string; links:string[]; }
export interface ResearchResult { company:string; pages:Page[]; pages_used:string[]; discussion:string[]; discussion_evidence:string[]; gaps:string[]; }

function isPrivateIp(ip:string){
  if(net.isIPv4(ip)) return ip.startsWith("10.") || ip.startsWith("127.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) || ip === "0.0.0.0";
  return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
}

async function validateTarget(url:string, allowLocal=false){
  let u:URL; try{u=new URL(url);}catch{throw new Error("Invalid company URL");}
  if(!["http:","https:"].includes(u.protocol)) throw new Error("Only http and https URLs are supported");
  const host=u.hostname.toLowerCase();
  if(!(allowLocal || env.ALLOW_LOCAL_URLS) && (host === "localhost" || isPrivateIp(host))) throw new Error("Private or loopback company URL is not allowed in production");
  try{const records=await dns.lookup(host,{all:true}); if(!(allowLocal || env.ALLOW_LOCAL_URLS) && records.some(r=>isPrivateIp(r.address))) throw new Error("Private or loopback company URL is not allowed in production");}catch(e:any){if(e.message.includes("Private or loopback")) throw e;}
  return u;
}

async function fetchPage(url:string, userAgent="PrepKitResearch/1.0", allowLocal=false){
  return withRetry(async()=>{
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),env.FETCH_TIMEOUT_MS);
    try{
      let target=url; let res:Response|undefined;
      for(let redirectCount=0; redirectCount<4; redirectCount++){
        await validateTarget(target,allowLocal);
        res=await fetch(target,{redirect:"manual",signal:controller.signal,headers:{"user-agent":userAgent,accept:"text/html,application/xhtml+xml,text/plain"}});
        if(res.status>=300 && res.status<400){const location=res.headers.get("location");if(!location)throw new Error(`HTTP ${res.status} redirect without location`);target=new URL(location,target).toString();continue;}
        break;
      }
      if(!res) throw new Error("No response");
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const type=res.headers.get("content-type")||""; if(!type.includes("text/html") && !type.includes("text/plain")) throw new Error(`Unsupported content type: ${type}`);
      const reader=res.body?.getReader(); if(!reader) throw new Error("Empty response");
      const chunks:Uint8Array[]=[]; let total=0;
      while(true){const {done,value}=await reader.read(); if(done) break; total+=value.byteLength; if(total>env.MAX_FETCH_BYTES){await reader.cancel(); throw new Error("Response exceeds configured size limit");} chunks.push(value);}
      const text=new TextDecoder().decode(Buffer.concat(chunks));
      return {text,type};
    } finally {clearTimeout(timer);}
  },3);
}

function cleanHtml(html:string){
  const $=cheerio.load(html); $("script,style,noscript,svg,nav,footer").remove();
  return {title:$("title").first().text().trim(),text:$("body").text().replace(/\s+/g," ").trim()};
}
function extractLinks(base:string,html:string){
  const $=cheerio.load(html); const out:string[]=[]; const origin=new URL(base).origin;
  $("a[href]").each((_,el)=>{const href=$(el).attr("href"); if(!href) return; try{const u=new URL(href,base); if(u.origin===origin && ["http:","https:"].includes(u.protocol)){u.hash=""; out.push(u.toString());}}catch{}});
  return [...new Set(out)].slice(0,env.MAX_LINKS_PER_PAGE);
}
function scoreLink(url:string){
  const s=url.toLowerCase(); let score=0;
  for(const [word,weight] of [["career",8],["hiring",8],["job",7],["interview",7],["engineer",5],["handbook",6],["about",5],["culture",4],["people",3],["blog",2],["company",3]] as const) if(s.includes(word)) score+=weight;
  return score;
}

async function readRobots(origin:string){
  try{const r=await fetch(`${origin}/robots.txt`,{headers:{"user-agent":"PrepKitResearch/1.0"}}); return robotsParser(`${origin}/robots.txt`,await r.text());}catch{return null;}
}

async function publicDiscussion(company:string){
  if(!env.PUBLIC_SEARCH_ENABLED) return [];
  try{
    const q=encodeURIComponent(`"${company}" interview process engineering interview`);
    const res=await fetch(`https://html.duckduckgo.com/html/?q=${q}`,{headers:{"user-agent":"PrepKitResearch/1.0","accept":"text/html"}});
    if(!res.ok) throw new Error(`Search HTTP ${res.status}`);
    const html=await res.text(); const $=cheerio.load(html); const links:string[]=[];
    $(".result__a").each((_,el)=>{const href=$(el).attr("href"); if(href) links.push(href);});
    return [...new Set(links)].slice(0,6);
  }catch{return []}
}

export async function researchCompany(companyUrl:string, companyHint?:string, allowLocal=false):Promise<ResearchResult>{
  const root=await validateTarget(companyUrl, allowLocal); const robots=await readRobots(root.origin); const queue=[root.toString()]; const seen=new Set<string>(); const pages:Page[]=[]; const gaps:string[]=[];
  while(queue.length && pages.length<env.MAX_CRAWL_PAGES){
    const url=queue.shift()!; if(seen.has(url)) continue; seen.add(url);
    if(robots && !robots.isAllowed(url,"PrepKitResearch/1.0")){gaps.push(`robots.txt disallowed ${url}`); continue;}
    try{
      const {text,type}=await fetchPage(url,"PrepKitResearch/1.0",allowLocal); if(!type.includes("html")){continue;}
      const parsed=cleanHtml(text); const links=extractLinks(url,text); pages.push({url,title:parsed.title,text:parsed.text.slice(0,12000),links});
      const ranked=links.map(u=>({u,s:scoreLink(u)})).sort((a,b)=>b.s-a.s).filter(x=>x.s>0).slice(0,Math.max(3,env.MAX_CRAWL_PAGES-pages.length));
      for(const item of ranked) if(!seen.has(item.u) && !queue.includes(item.u)) queue.push(item.u);
    }catch(e:any){gaps.push(`${url}: ${e.message}`)}
  }
  const company=companyHint || pages[0]?.title?.split("|")[0]?.split("-")[0]?.trim() || new URL(companyUrl).hostname.replace(/^www\./,"");
  const discussion=await publicDiscussion(company);
  const discussionEvidence:string[]=[];
  for(const url of discussion.slice(0,3)){try{const fetched=await fetchPage(url);const parsed=cleanHtml(fetched.text);discussionEvidence.push(`URL: ${url}\n${parsed.text.slice(0,5000)}`)}catch{gaps.push(`Could not retrieve public discussion ${url}`)}}
  if(!discussion.length) gaps.push("No public interview discussion was found or the search provider was unavailable.");
  return {company,pages,pages_used:pages.map(p=>p.url),discussion,discussion_evidence:discussionEvidence,gaps};
}
