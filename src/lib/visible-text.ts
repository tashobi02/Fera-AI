// Visible-text length for required free text (TASK-026 description, TASK-028 reject reason).
// The frozen contract counts every code point, so a value made only of zero-width spaces
// would pass as "3 characters". Whitespace and invisible format characters are not counted.
// ZWNJ/ZWJ are meaningful inside Bangla words, so they stay in the value; they simply do not
// count towards the minimum.
const INVISIBLE = /[\s\u200B-\u200F\u2028\u2029\u2060\uFEFF\u00AD]/gu;

export function visibleLength(value: string): number {
  return [...value.replace(INVISIBLE, "")].length;
}
