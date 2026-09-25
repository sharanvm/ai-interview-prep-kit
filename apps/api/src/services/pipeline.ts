import crypto from "node:crypto";
import { allocateSchedule, checkCoverage, validateKit, Kit } from "@prep-kit/core";
import { researchCompany } from "./research";
import { extractRole, generateCompanyBrief, generateFlashcards, generateGapQuestions, generateQuestionsByCategory } from "./generator";

export interface PipelineInput { jd:string; company_url:string; days:number; allowLocalUrls?:boolean; }
export type ProgressFn=(step:string,percent:number)=>void;

export function inputHash(input:PipelineInput){return crypto.createHash("sha256").update(`${input.jd.trim()}|${input.company_url.trim().replace(/\/$/,"")}|${input.days}`).digest("hex");}

export async function buildKit(input:PipelineInput,onProgress:ProgressFn=()=>{}):Promise<Kit>{
  if(!input.jd.trim()) throw new Error("Job description is required");
  if(!Number.isInteger(input.days)||input.days<1||input.days>365) throw new Error("days must be an integer between 1 and 365");
  onProgress("Extracting role requirements",10);
  const role=await extractRole(input.jd);
  onProgress("Researching company",25);
  const research=await researchCompany(input.company_url,undefined,Boolean(input.allowLocalUrls));
  onProgress("Generating company brief",40);
  const brief=await generateCompanyBrief(research.company,research);
  const categories=["technical","behavioural","system-design","company-fit"];
  const questions:any[]=[]; let qCounter=1;
  if(role.requirements.length){
    for(let i=0;i<categories.length;i++){
      const qs=await generateQuestionsByCategory(role,input.jd,research,role.requirements,categories[i],qCounter); questions.push(...qs); qCounter+=qs.length; onProgress(`Generating ${categories[i]} questions`,45+i*8);
    }
  }
  let passes=1;
  let gaps=checkCoverage(role.requirements,questions);
  if(gaps.length){
    onProgress("Closing coverage gaps",80);
    const gapQuestions=await generateGapQuestions(gaps,role.requirements,role); questions.push(...gapQuestions); passes=2; gaps=checkCoverage(role.requirements,questions);
  }
  onProgress("Generating flashcards",86);
  const flashcards=await generateFlashcards(role.requirements,questions);
  onProgress("Allocating study schedule",91);
  const schedule=allocateSchedule(role.requirements,questions,input.days);
  const kit:Kit={
    source:{company:research.company,company_url:input.company_url,role:role.title,location:role.location,jd_chars:input.jd.length,researched_at:new Date().toISOString(),pages_used:research.pages_used},
    company_brief:brief,
    role:{title:role.title,seniority:role.seniority,responsibilities:role.responsibilities,requirements:role.requirements},
    questions,flashcards,schedule:{days_available:input.days,days:schedule},coverage:{uncovered_requirement_ids:gaps,passes},research_gaps:research.gaps
  };
  validateKit(kit); onProgress("Complete",100); return kit;
}
