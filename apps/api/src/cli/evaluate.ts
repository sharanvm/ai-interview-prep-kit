import fs from "node:fs/promises";
import { buildKit } from "../services/pipeline";
import { BatchCase } from "@prep-kit/core";

function arg(name:string){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;}
async function main(){
  const inputPath=arg("--input"), outputPath=arg("--output");
  if(!inputPath||!outputPath) throw new Error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  const cases=JSON.parse(await fs.readFile(inputPath,"utf8"));
  if(!Array.isArray(cases)) throw new Error("Input must be an array of cases");
  const kits=[];
  for(const item of cases as BatchCase[]){
    try{
      const kit=await buildKit({jd:item.jd,company_url:item.company_url,days:item.days,allowLocalUrls:true});
      kits.push({id:item.id,status:"ok",kit,error:null});
    }catch(e:any){
      kits.push({id:item.id,status:"failed",kit:null,error:{code:e.code||"PIPELINE_ERROR",message:e.message||"Case failed"}});
    }
  }
  await fs.writeFile(outputPath,JSON.stringify({version:"1.0",generated_at:new Date().toISOString(),kits},null,2));
  console.log(`Wrote ${kits.length} cases to ${outputPath}`);
}
main().catch(err=>{console.error(err);process.exit(1)});
