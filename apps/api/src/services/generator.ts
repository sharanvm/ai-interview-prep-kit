import { Requirement, Question, Flashcard } from "@prep-kit/core";
import { generateJson } from "./llm";
import { ResearchResult } from "./research";

const safeText = (v: any): string =>
  typeof v === "string" ? v.trim() : "";

export async function extractRole(jd: string) {
  const trimmed = jd.trim();

  if (trimmed.length < 180) {
    const title =
      trimmed
        .split(/\n+/)
        .map((x) => x.trim())
        .find(Boolean) || "";

    return {
      title,
      seniority: "",
      location: "",
      responsibilities: [],
      requirements: [] as Requirement[],
    };
  }

  const result = await generateJson<any>(
    "Extract only facts supported by the job description. Never invent requirements. Mark wording such as required/must/need as must, and bonus/preferred/nice-to-have as nice. Stable IDs start at r1.",
    `JOB DESCRIPTION:
${jd}

Return JSON with title, seniority, location, responsibilities (array of strings), and requirements (array of {id,text,kind,priority}). kind must be technical, behavioural, or domain; priority must be must or nice.`,
    {
      type: "object",
      properties: {
        title: { type: "string" },
        seniority: { type: "string" },
        location: { type: "string" },
        responsibilities: {
          type: "array",
          items: { type: "string" },
        },
        requirements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              kind: {
                type: "string",
                enum: ["technical", "behavioural", "domain"],
              },
              priority: {
                type: "string",
                enum: ["must", "nice"],
              },
            },
            required: ["id", "text", "kind", "priority"],
          },
        },
      },
      required: [
        "title",
        "seniority",
        "location",
        "responsibilities",
        "requirements",
      ],
    }
  );

  const requirements: Requirement[] = (result.requirements || [])
    .map((r: any, i: number) => ({
      id: `r${i + 1}`,
      text: safeText(r.text),
      kind: r.kind,
      priority: r.priority,
    }))
    .filter((r: Requirement) => r.text);

  return {
    title: safeText(result.title),
    seniority: safeText(result.seniority),
    location: safeText(result.location),
    responsibilities: (result.responsibilities || [])
      .map(safeText)
      .filter(Boolean),
    requirements,
  };
}

export async function generateCompanyBrief(
  company: string,
  research: ResearchResult
) {
  if (!research.pages.length) {
    const message =
      "No reliable company pages could be retrieved; the brief is intentionally left evidence-limited rather than inferred.";

    return {
      summary: message,
      what_they_do: message,
      sources: [...research.discussion],
    };
  }

  const evidence = research.pages
    .slice(0, 8)
    .map(
      (p) =>
        `URL: ${p.url}\nTITLE: ${p.title}\nTEXT: ${p.text.slice(0, 5000)}`
    )
    .join("\n\n");

  const discussions = research.discussion_evidence.join("\n\n");

  const result = await generateJson<any>(
    "Summarize only evidence supplied. Never invent company facts. If evidence is weak, explicitly say so.",
    `COMPANY: ${company}
RESEARCH PAGES:
${evidence}

PUBLIC DISCUSSION LINKS:
${discussions}

Return JSON with summary and what_they_do.`,
    {
      type: "object",
      properties: {
        summary: { type: "string" },
        what_they_do: { type: "string" },
      },
      required: ["summary", "what_they_do"],
    }
  );

  return {
    summary: safeText(result.summary),
    what_they_do: safeText(result.what_they_do),
    sources: [...research.pages_used, ...research.discussion],
  };
}

const categoryPrompt = (
  category: string,
  role: any,
  jd: string,
  research: ResearchResult,
  requirements: Requirement[]
) => `Generate interview questions ONLY for category ${category}. Each question must reference one or more requirement IDs. Do not invent requirements; company-fit questions may reference relevant must requirements when appropriate. Difficulty must be 1, 2 or 3. Return 2-4 useful questions, not filler.
ROLE: ${role.title}
REQUIREMENTS: ${JSON.stringify(requirements)}
RESPONSIBILITIES: ${JSON.stringify(role.responsibilities)}
JOB DESCRIPTION: ${jd.slice(0, 14000)}
COMPANY EVIDENCE: ${research.pages
    .slice(0, 4)
    .map((p) => p.text.slice(0, 2500))
    .join("\n")}
PUBLIC INTERVIEW EVIDENCE: ${research.discussion_evidence
    .slice(0, 3)
    .join("\n")}
`;

export async function generateQuestionsByCategory(
  role: any,
  jd: string,
  research: ResearchResult,
  requirements: Requirement[],
  category: string,
  start: number
): Promise<Question[]> {
  const result = await generateJson<any[]>(
    "Generate concise, realistic interview questions with strong answer outlines. Return JSON array only.",
    categoryPrompt(
      category,
      role,
      jd,
      research,
      requirements
    ),
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement_ids: {
            type: "array",
            items: { type: "string" },
          },
          prompt: { type: "string" },
          answer_outline: { type: "string" },
          difficulty: {
            type: "integer",
            minimum: 1,
            maximum: 3,
          },
        },
        required: [
          "requirement_ids",
          "prompt",
          "answer_outline",
          "difficulty",
        ],
      },
    }
  );

  /*
   * Build the objects as Question first and let TypeScript infer the
   * correct Question type. This avoids treating the category field as
   * an arbitrary string during Array.filter().
   */
  const questions: Question[] = (
    Array.isArray(result) ? result : []
  ).map(
    (q: any, i: number): Question => ({
      id: `q${start + i}`,
      requirement_ids: [...(q.requirement_ids || [])].filter(
        (id: string) =>
          requirements.some((r) => r.id === id)
      ),
      category: category as Question["category"],
      prompt: safeText(q.prompt),
      answer_outline: safeText(q.answer_outline),
      difficulty: Math.max(
        1,
        Math.min(3, Number(q.difficulty) || 1)
      ) as 1 | 2 | 3,
    })
  );

  return questions.filter(
    (q) => Boolean(q.prompt) && q.requirement_ids.length > 0
  );
}

export async function generateGapQuestions(
  gaps: string[],
  requirements: Requirement[],
  role: any
): Promise<Question[]> {
  const result = await generateJson<any[]>(
    "Generate only missing questions for the listed requirement IDs. Never invent requirements. Return JSON array only.",
    `ROLE: ${role.title}
REQUIREMENTS: ${JSON.stringify(requirements)}
MISSING IDS: ${JSON.stringify(gaps)}
For each missing ID create one high-value question.`,
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement_id: { type: "string" },
          category: {
            type: "string",
            enum: [
              "technical",
              "behavioural",
              "system-design",
              "company-fit",
            ],
          },
          prompt: { type: "string" },
          answer_outline: { type: "string" },
          difficulty: {
            type: "integer",
            minimum: 1,
            maximum: 3,
          },
        },
        required: [
          "requirement_id",
          "category",
          "prompt",
          "answer_outline",
          "difficulty",
        ],
      },
    }
  );

  const questions: Question[] = (
    Array.isArray(result) ? result : []
  ).map(
    (q: any, i: number): Question => ({
      id: `qgap${Date.now()}_${i}`,
      requirement_ids: requirements.some(
        (r) => r.id === q.requirement_id
      )
        ? [q.requirement_id]
        : [],
      category: q.category as Question["category"],
      prompt: safeText(q.prompt),
      answer_outline: safeText(q.answer_outline),
      difficulty: Math.max(
        1,
        Math.min(3, Number(q.difficulty) || 1)
      ) as 1 | 2 | 3,
    })
  );

  return questions.filter(
    (q) => q.requirement_ids.length > 0 && Boolean(q.prompt)
  );
}

export async function generateFlashcards(
  requirements: Requirement[],
  questions: Question[]
): Promise<Flashcard[]> {
  if (!requirements.length) {
    return [];
  }

  const result = await generateJson<any[]>(
    "Create concise study flashcards from the supplied material. Do not introduce new requirements. Return JSON array only.",
    `REQUIREMENTS: ${JSON.stringify(requirements)}
QUESTIONS: ${JSON.stringify(questions)}
Return 1-2 flashcards for important requirements.`,
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          requirement_ids: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["front", "back", "requirement_ids"],
      },
    }
  );

  return (Array.isArray(result) ? result : [])
    .map(
      (f: any, i: number): Flashcard => ({
        id: `f${i + 1}`,
        front: safeText(f.front),
        back: safeText(f.back),
        requirement_ids: [...(f.requirement_ids || [])].filter(
          (id: string) =>
            requirements.some((r) => r.id === id)
        ),
      })
    )
    .filter((f: Flashcard) => f.front && f.back);
}