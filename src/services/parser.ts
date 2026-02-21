import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Note } from "../types.js";
import { NOTE_EXTENSION, FRONTMATTER_SEPARATOR } from "../constants.js";

export function generateId(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sanitizeFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .slice(0, 80);
  return slug + NOTE_EXTENSION;
}

export function parseFrontMatter(raw: string): {
  meta: Record<string, unknown>;
  body: string;
  rawFrontMatter: string;
} {
  if (!raw.startsWith(FRONTMATTER_SEPARATOR + "\n")) {
    return { meta: {}, body: raw, rawFrontMatter: "" };
  }

  const afterOpen = raw.slice(FRONTMATTER_SEPARATOR.length + 1);
  const closeIdx = afterOpen.indexOf("\n" + FRONTMATTER_SEPARATOR);
  if (closeIdx === -1) {
    return { meta: {}, body: raw, rawFrontMatter: "" };
  }

  const fmText = afterOpen.slice(0, closeIdx);
  const rawFrontMatter = `${FRONTMATTER_SEPARATOR}\n${fmText}\n${FRONTMATTER_SEPARATOR}`;
  const body = afterOpen.slice(closeIdx + FRONTMATTER_SEPARATOR.length + 1).trimStart();

  const meta: Record<string, unknown> = {};
  for (const line of fmText.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;
    const rawVal = line.slice(colonIdx + 1).trim();

    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      meta[key] = rawVal
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      meta[key] = rawVal;
    }
  }

  return { meta, body, rawFrontMatter };
}

export function noteFromFile(filePath: string, extractionBase: string): Note {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body, rawFrontMatter } = parseFrontMatter(raw);
  const stat = fs.statSync(filePath);

  // Derive notebook from directory position relative to extraction root
  const relPath = path.relative(extractionBase, filePath);
  const relDir = path.dirname(relPath);
  const notebook =
    relDir === "." || relDir === ""
      ? "Default"
      : relDir.split(path.sep)[0] ?? "Default";

  // Title: front matter > first # heading > de-slugified filename
  const title =
    (meta["title"] as string | undefined) ??
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    path
      .basename(filePath, NOTE_EXTENSION)
      .replace(/-/g, " ")
      .replace(/_/g, " ");

  // ID: front matter > sha256 of relative path (stable across syncs)
  const id = (meta["id"] as string | undefined) ?? generateId(relPath);

  // Tags
  const rawTags = meta["tags"];
  const tags = Array.isArray(rawTags)
    ? rawTags.map(String)
    : typeof rawTags === "string" && rawTags
    ? [rawTags]
    : [];

  // Dates: front matter > filesystem times
  const createdAt =
    (meta["created"] as string | undefined) ?? stat.birthtime.toISOString();
  const updatedAt =
    (meta["updated"] as string | undefined) ?? stat.mtime.toISOString();

  return {
    id,
    title,
    notebook,
    tags,
    createdAt,
    updatedAt,
    filePath,
    content: body,
    rawFrontMatter,
  };
}

export function noteToMarkdown(note: Note): string {
  const body = note.content.trimStart();
  // If the content already starts with the title heading, don't duplicate it
  const titleHeading = `# ${note.title}`;
  if (body.startsWith(titleHeading)) {
    return body;
  }
  return `${titleHeading}\n\n${body}`;
}
