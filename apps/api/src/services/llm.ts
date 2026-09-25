import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { withRetry } from "../lib/http";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

function parseJson(text:string){
  const cleaned=text.trim().replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
  try{return JSON.parse(cleaned);}catch{}
  const start=Math.min(...[cleaned.indexOf("{"),cleaned.indexOf("[")].filter(i=>i>=0));
  const end=Math.max(cleaned.lastIndexOf("}"),cleaned.lastIndexOf("]"));
  if(start>=0 && end>start) return JSON.parse(cleaned.slice(start,end+1));
  throw new Error("Model returned invalid JSON");
}

export async function generateJson<T>(system:string, prompt:string, responseSchema?:Record<string,unknown>):Promise<T>{
  return withRetry(async()=>{
    const response=await ai.models.generateContent({
      model:env.GEMINI_MODEL,
      contents:prompt,
      config:{systemInstruction:system,responseMimeType:"application/json",responseSchema,maxOutputTokens:7000,temperature:0.2}
    });
    return parseJson(response.text || "") as T;
  },3);
}
