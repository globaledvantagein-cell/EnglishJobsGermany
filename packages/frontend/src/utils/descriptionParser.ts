/**
 * Job description parser — splits raw text into sections + paragraph/list blocks.
 * Used by FormattedDescription. Pure logic, no React.
 */

export type Section = { title: string | null; body: string };

export type BodyBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

const HEADER_PATTERNS: Array<{ regex: RegExp; label?: string }> = [
  { regex: /^About the Role\b/i, label: 'About the Role' },
  { regex: /^About the team\b/i, label: 'About the team' },
  { regex: /^About us\b/i, label: 'About us' },
  { regex: /^About\s+[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3}\b/ },
  { regex: /^The Community You Will Join\b/i, label: 'The Community You Will Join' },
  { regex: /^The Difference You will Make\b/i, label: 'The Difference You will Make' },
  { regex: /^A Typical Day\b/i, label: 'A Typical Day' },
  { regex: /^What You'll Do\b/i, label: "What You'll Do" },
  { regex: /^What you'll do\b/i, label: "What you'll do" },
  { regex: /^What you will do\b/i, label: 'What you will do' },
  { regex: /^Your role\b/i, label: 'Your role' },
  { regex: /^What You'll Bring\b/i, label: "What You'll Bring" },
  { regex: /^Who you are\b/i, label: 'Who you are' },
  { regex: /^Your Expertise\b/i, label: 'Your Expertise' },
  { regex: /^What we're looking for\b/i, label: "What we're looking for" },
  { regex: /^Minimum requirements\b/i, label: 'Minimum requirements' },
  { regex: /^Preferred qualifications\b/i, label: 'Preferred qualifications' },
  { regex: /^How We'll Take Care of You\b/i, label: "How We'll Take Care of You" },
  { regex: /^How GitLab will support you\b/i, label: 'How GitLab will support you' },
  { regex: /^What we offer\b/i, label: 'What we offer' },
  { regex: /^Our Commitment To Inclusion\b/i, label: 'Our Commitment To Inclusion' },
  { regex: /^Country Hiring Guidelines\b/i, label: 'Country Hiring Guidelines' },
  { regex: /^Privacy Policy\b/i, label: 'Privacy Policy' },
  { regex: /^Benefits to support\b/i, label: 'Benefits to support' },
  { regex: /^Flexible Paid Time Off\b/i, label: 'Flexible Paid Time Off' },
  { regex: /^Location & Team Structure\b/i, label: 'Location & Team Structure' },
  { regex: /^Location\b/i, label: 'Location' },
];

const BULLET_MARKER = /^[\*\-•·●]\s+/;
export const SALARY_REGEX = /((?:EUR|USD|GBP|[$€£])\s?\d{1,3}(?:[.,]\d{3})*(?:\s?(?:to|-|–|—)\s?(?:(?:EUR|USD|GBP|[$€£])\s?)?\d{1,3}(?:[.,]\d{3})*)?)/gi;
const VERB_BULLET_START = /^(Own|Translate|Partner|Lead|Design|Collaborate|Drive|Build|Create|Develop|Support|Manage|Deliver|Define|Shape|Help|Work|Conduct|Plan|Coordinate|Present|Review|Write|Prototype|Craft)\b/i;
const LEADING_PUNCTUATION = /^[,;:.!?\)\]\}]+/;

function normalizeText(value: string) {
  return (value || '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sentenceBoundaryIndices(text: string) {
  const boundaries = [0];
  const regex = /[.!?]\s+/g;
  let match = regex.exec(text);
  while (match) {
    boundaries.push(match.index + match[0].length);
    match = regex.exec(text);
  }
  return Array.from(new Set(boundaries)).sort((a, b) => a - b);
}

function readHeaderAt(chunk: string) {
  for (const candidate of HEADER_PATTERNS) {
    const match = chunk.match(candidate.regex);
    if (!match) continue;
    const raw = match[0].trim();
    const rest = chunk.slice(match[0].length).trim();
    if (!rest) return null;
    return { header: candidate.label || raw, rawLength: match[0].length };
  }
  return null;
}

function mergeLeadingPunctuationSections(sections: Section[]): Section[] {
  const merged: Section[] = [];
  for (const section of sections) {
    const title = section.title?.trim() || null;
    const body = section.body.trim();
    if (!body) continue;
    if (LEADING_PUNCTUATION.test(body) && merged.length > 0) {
      const previous = merged[merged.length - 1];
      previous.body = `${previous.body}${body}`.trim();
      continue;
    }
    merged.push({ title, body });
  }
  return merged;
}

export function splitIntoSections(description: string): Section[] {
  const text = normalizeText(description);
  if (!text) return [];

  const boundaries = sentenceBoundaryIndices(text);
  const headers: Array<{ index: number; header: string; rawLength: number }> = [];

  for (const boundary of boundaries) {
    const chunk = text.slice(boundary).trimStart();
    if (!chunk) continue;
    const result = readHeaderAt(chunk);
    if (!result) continue;
    const absoluteIndex = text.indexOf(chunk, boundary);
    if (absoluteIndex < 0) continue;
    headers.push({ index: absoluteIndex, header: result.header, rawLength: result.rawLength });
  }

  const uniqueHeaders = headers.filter((item, i, arr) => i === 0 || item.index !== arr[i - 1].index);
  if (!uniqueHeaders.length) return [{ title: null, body: text }];

  const sections: Section[] = [];

  if (uniqueHeaders[0].index > 0) {
    const intro = text.slice(0, uniqueHeaders[0].index).trim();
    if (intro) sections.push({ title: null, body: intro });
  }

  for (let i = 0; i < uniqueHeaders.length; i++) {
    const current = uniqueHeaders[i];
    const next = uniqueHeaders[i + 1];
    const bodyStart = current.index + current.rawLength;
    const bodyEnd = next ? next.index : text.length;
    const body = text.slice(bodyStart, bodyEnd).replace(/^\s*[:\-]?\s*/, '').trim();
    if (body) sections.push({ title: current.header, body });
  }

  return mergeLeadingPunctuationSections(sections);
}

function toSentences(text: string): string[] {
  const sentences = text
    .match(/[^.!?]+[.!?]?/g)
    ?.map(s => s.trim())
    .filter(Boolean) || [];

  const merged: string[] = [];
  for (const sentence of sentences) {
    if (LEADING_PUNCTUATION.test(sentence) && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${sentence}`;
      continue;
    }
    merged.push(sentence);
  }
  return merged;
}

function looksLikeBulletSentence(sentence: string) {
  if (!sentence) return false;
  if (BULLET_MARKER.test(sentence)) return true;
  if (/^[A-Z][^:]{2,40}:\s+/.test(sentence)) return true;
  if (/^[A-Z][^\-]{2,40}\s+(?:-|–|—)\s+/.test(sentence)) return true;
  const words = sentence.split(/\s+/).length;
  if (words <= 18 && VERB_BULLET_START.test(sentence)) return true;
  return false;
}

export function buildBodyBlocks(body: string): BodyBlock[] {
  const sentences = toSentences(body);
  if (!sentences.length) return [{ type: 'paragraph', text: body }];

  const blocks: BodyBlock[] = [];
  let paragraphBuffer: string[] = [];
  let bulletBuffer: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    blocks.push({ type: 'paragraph', text: paragraphBuffer.join(' ').trim() });
    paragraphBuffer = [];
  };

  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    if (bulletBuffer.length >= 2) {
      blocks.push({ type: 'list', items: [...bulletBuffer] });
    } else {
      paragraphBuffer.push(...bulletBuffer);
      flushParagraph();
    }
    bulletBuffer = [];
  };

  for (const sentence of sentences) {
    const clean = sentence.replace(BULLET_MARKER, '').trim();
    if (!clean) continue;
    if (looksLikeBulletSentence(sentence)) {
      flushParagraph();
      bulletBuffer.push(clean);
      continue;
    }
    flushBullets();
    paragraphBuffer.push(clean);
    const paragraphLength = paragraphBuffer.join(' ').length;
    if (paragraphBuffer.length >= 3 || paragraphLength > 340) flushParagraph();
  }

  flushBullets();
  flushParagraph();

  return blocks.filter(b => b.type === 'list' ? b.items.length > 0 : Boolean(b.text));
}
