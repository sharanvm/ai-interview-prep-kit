# AI Interview Prep Kit

Full-stack engineering assessment implementation for turning a job description, company URL and interview timeline into a research-backed interview preparation kit.

## Stack

- Next.js 16 + TypeScript + Tailwind CSS
- Node.js + Express 5
- MongoDB + Mongoose
- Google Gemini API through `@google/genai`
- Cheerio for HTML extraction
- Vitest for deterministic algorithm tests

Gemini is configurable through `GEMINI_MODEL`; the default is `gemini-3.8-flash`. Google currently documents a free developer tier and structured JSON generation for Gemini, while API rate limits apply to requests and tokens, so the implementation includes retries/backoff and bounded concurrency. See Google's current API documentation for the active limits and model availability.

## Architecture

`apps/web` contains the Next.js UI. `apps/api` contains authentication, persistence, HTTP routes, research and generation orchestration. `packages/core` contains the deterministic kit schema, coverage checker and schedule allocator so those decisions are shared by the web API and the mandatory batch evaluator.

Pipeline:

1. Validate input.
2. Crawl the supplied company URL and rank useful same-origin links.
3. Retrieve likely about/careers/hiring/engineering pages while respecting `robots.txt`, size and timeout limits.
4. Search public web discussion about the company's interview process; unavailable sources are recorded as gaps.
5. Extract requirements from the pasted JD.
6. Generate the company brief from retrieved evidence.
7. Generate technical, behavioural, system-design and company-fit questions in separate model calls when relevant.
8. Generate flashcards from the extracted requirements and questions.
9. Deterministically check question coverage against requirement IDs.
10. Generate missing questions for uncovered requirements and check coverage again (bounded to 2 total passes).
11. Deterministically allocate questions across exactly the requested number of days.
12. Validate the complete kit against the Appendix A contract before persistence/output.

The LLM never decides coverage or schedule arithmetic.

## Editing and regeneration state

Generated content is stored in the kit. User changes are stored as patch records with a stable item ID and a field-level edited state. Regeneration creates a fresh generated section, then merges user-created/edited/pinned records back by ID. A user-edited question therefore survives regeneration of its category. This keeps generated content and user intent separate instead of overwriting the whole document.

## Practice mode

Confidence is stored per flashcard. The next practice session sorts cards by lowest confidence first, then by least-recently-seen time. This is intentionally a simple confidence-weighted strategy rather than full spaced repetition. A small custom feature called **Weak Spots** surfaces cards rated 1–2 so the user can see the areas needing attention without leaving practice mode.

## Retrieval and safety

The crawler follows relative links and ranks links instead of hard-coding `/careers` or `/jobs`. It reads `robots.txt`, limits page size, restricts content types, uses request timeouts and exponential backoff, and treats fetched text as untrusted content. Production mode rejects private/loopback targets; the batch evaluator can opt into local test sites because the assessment explicitly allows local company URLs.

Public discussion search is best-effort. If the search provider is unavailable or no discussion is found, the kit remains valid and records that gap rather than inventing evidence.

## Setup

Requires Node.js 20.9+ and MongoDB. Create `.env` from `.env.example` and add a Gemini API key from Google AI Studio.

```bash
npm install
npm run dev
```

Frontend: `http://localhost:3000`
Backend health: `http://localhost:4000/health`

## Batch evaluator

Mandatory command:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Example:

```bash
npm run evaluate -- --input ./cases.json --output ./kits.json
```

The evaluator uses the same pipeline as the application and continues after individual case failures. It writes the exact Appendix B envelope: `version`, `generated_at`, and `kits` entries with `ok` or `failed` status.

## Testing

```bash
npm test
```

The tests protect schedule allocation, coverage checking and kit structure validation.

## Failure handling

- Invalid/timeout/404 company sites become structured research gaps; a case is marked failed only when no kit can be produced at all.
- Invalid model JSON is retried once and then surfaced as a structured generation error.
- Rate-limit/transient failures use bounded exponential backoff.
- Thin job descriptions produce thin, evidence-based kits; requirements are not invented.
- Duplicate user submissions are detected by a hash of normalized JD + company URL + days.

## Deployment

Deploy the Next.js app and Express API separately. Set all environment variables in the hosting provider rather than committing `.env`. MongoDB Atlas can be used for the database. The frontend needs `NEXT_PUBLIC_API_URL`; the API needs `WEB_ORIGIN`, `MONGODB_URI`, `SESSION_SECRET` and `GEMINI_API_KEY`.

## Known limitations

Public search HTML changes over time and can be blocked by providers. The crawler therefore treats interview-discussion discovery as best-effort rather than making unsupported claims. JavaScript-heavy company pages that expose no useful server-rendered HTML may provide fewer research pages.
