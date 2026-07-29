import { BadRequestException } from "@nestjs/common";
import { requiredBuildReadyMarkdownHeadings } from "@sandeul/contracts";
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

export function validateBuildReadyMarkdown(markdown: string): void {
  const headings = new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1]?.trim().toLowerCase()),
  );
  const missing = requiredBuildReadyMarkdownHeadings.filter(
    (required) => !headings.has(required.toLowerCase()),
  );
  if (missing.length) {
    throw new BadRequestException({
      message: "Build-ready Markdown PRD 필수 섹션이 누락되었습니다.",
      missingHeadings: missing,
    });
  }
  if (!/담당자\s*:\s*산들\s*,\s*수빈/.test(markdown)) {
    throw new BadRequestException("PRD 담당자는 '산들, 수빈'으로 고정해야 합니다.");
  }
  if (!/targetSdk\s*:\s*(?:3[6-9]|[4-9][0-9])\b/i.test(markdown)) {
    throw new BadRequestException("Android targetSdk는 36 이상이어야 합니다.");
  }
  if (!/compileSdk\s*:\s*(?:3[6-9]|[4-9][0-9])\b/i.test(markdown)) {
    throw new BadRequestException("Android compileSdk는 36 이상이어야 합니다.");
  }
  if (!/release debuggable\s*:\s*false/i.test(markdown)) {
    throw new BadRequestException("Release build는 debuggable=false여야 합니다.");
  }
}

export function latestByLogicalId<T extends { logicalId: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.logicalId)) return false;
    seen.add(record.logicalId);
    return true;
  });
}
