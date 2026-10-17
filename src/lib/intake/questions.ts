// Follow-up question template interpolation (TASK-021, D3 COMP-009).
// When the child's name is known, interpolates it into {নাম} / {name}.
// When the name is unknown (null, undefined, or empty), falls back to the locale words.
import { locales } from "@/locales";

export function formatQuestion(template: string, name?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return template
      .replaceAll("{নাম}", trimmed)
      .replaceAll("{name}", trimmed);
  }
  const { bn, en } = locales;
  return template
    .replaceAll("{নাম}-কে", bn.questionChildObject)
    .replaceAll("{নাম}-এর", bn.questionChildPossessive)
    .replaceAll("{নাম}", bn.questionChild)
    .replaceAll("{name}", en.questionChild);
}
