import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/ai_interview_prep"),
  SESSION_SECRET: z.string().default("development-only-change-me-please-32-chars"),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  PUBLIC_SEARCH_ENABLED: z.coerce.boolean().default(true),
  ALLOW_LOCAL_URLS: z.coerce.boolean().default(false),
  MAX_FETCH_BYTES: z.coerce.number().default(1500000),
  FETCH_TIMEOUT_MS: z.coerce.number().default(12000),
  MAX_CRAWL_PAGES: z.coerce.number().default(10),
  MAX_LINKS_PER_PAGE: z.coerce.number().default(60)
});

export const env = schema.parse(process.env);