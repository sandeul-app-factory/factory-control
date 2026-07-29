import { BadRequestException } from "@nestjs/common";
import { sha256 } from "@sandeul/security";

export interface PrdSectionInput {
  heading: string;
  anchor: string;
  ordinal: number;
  content: string;
  contentSha256: string;
}

export function parseStringArray(value: string | undefined, field: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("not a string array");
    }
    return parsed.map((item) => item.trim()).filter(Boolean);
  } catch {
    throw new BadRequestException(`${field}는 문자열 배열 JSON이어야 합니다.`);
  }
}

export function markdownSections(markdown: string): PrdSectionInput[] {
  const matches = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)];
  if (!matches.length) {
    return [
      {
        heading: "전체",
        anchor: "all",
        ordinal: 0,
        content: markdown,
        contentSha256: sha256(markdown),
      },
    ];
  }
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? markdown.length;
    const heading = match[2]?.trim() ?? `섹션 ${index + 1}`;
    const baseAnchor =
      heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 150) || `section-${index + 1}`;
    const content = markdown.slice(start, end).trim();
    return {
      heading,
      anchor: `${baseAnchor}-${index + 1}`,
      ordinal: index,
      content,
      contentSha256: sha256(content),
    };
  });
}

export function jsonSections(document: Record<string, unknown>): PrdSectionInput[] {
  return Object.entries(document).map(([heading, value], index) => {
    const content = JSON.stringify(value, null, 2);
    return {
      heading,
      anchor: `${heading.toLowerCase().replace(/[^a-z0-9-]/g, "-")}-${index + 1}`,
      ordinal: index,
      content,
      contentSha256: sha256(content),
    };
  });
}

export function latestByLogicalId<T extends { logicalId: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.logicalId)) return false;
    seen.add(record.logicalId);
    return true;
  });
}
