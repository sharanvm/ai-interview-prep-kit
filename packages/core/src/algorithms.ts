import { Kit, Question, Requirement, ScheduleDay } from "./types";

export function checkCoverage(requirements: Requirement[], questions: Question[]) {
  const covered = new Set<string>();
  for (const question of questions) {
    for (const id of question.requirement_ids) covered.add(id);
  }
  return requirements.filter(r => r.priority === "must" && !covered.has(r.id)).map(r => r.id);
}

export function allocateSchedule(requirements: Requirement[], questions: Question[], days: number): ScheduleDay[] {
  if (!Number.isInteger(days) || days < 1) throw new Error("days must be a positive integer");
  const result: ScheduleDay[] = Array.from({ length: days }, (_, i) => ({ day: i + 1, focus: "Review and practice", question_ids: [], minutes: 0 }));
  if (!questions.length) {
    result.forEach((d, i) => { d.focus = i === 0 ? "Review available material" : "Practice and review"; d.minutes = 30; });
    return result;
  }

  const priority = new Map(requirements.map(r => [r.id, r.priority]));
  const sorted = [...questions].sort((a, b) => {
    const aMust = a.requirement_ids.some(id => priority.get(id) === "must") ? 0 : 1;
    const bMust = b.requirement_ids.some(id => priority.get(id) === "must") ? 0 : 1;
    return aMust - bMust || b.difficulty - a.difficulty;
  });

  sorted.forEach((q, index) => {
    const dayIndex = Math.min(days - 1, Math.floor(index * days / sorted.length));
    result[dayIndex].question_ids.push(q.id);
    result[dayIndex].minutes += q.difficulty * 15;
  });

  result.forEach((d, i) => {
    const topics = d.question_ids.flatMap(id => {
      const q = questions.find(x => x.id === id);
      return q ? [q.category] : [];
    });
    d.focus = topics.length ? `Day ${i + 1}: ${[...new Set(topics)].join(", ")}` : "Review and practice";
    if (d.minutes < 20) d.minutes = 20;
  });
  return result;
}

export function validateSchedule(kit: Kit): string[] {
  const errors: string[] = [];
  if (kit.schedule.days.length !== kit.schedule.days_available) errors.push("schedule day count mismatch");
  const questionIds = new Set(kit.questions.map(q => q.id));
  for (const day of kit.schedule.days) {
    if (!Number.isInteger(day.minutes)) errors.push(`day ${day.day} minutes must be integer`);
    for (const id of day.question_ids) if (!questionIds.has(id)) errors.push(`schedule references unknown question ${id}`);
  }
  return errors;
}
