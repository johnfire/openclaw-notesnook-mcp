import { z } from "zod";

export const SearchNotesSchema = z.object({
  query: z.string().min(1).max(200).describe("Search terms to find in note titles and content"),
  notebook: z.string().optional().describe("Filter to a specific notebook name"),
  tags: z.array(z.string()).optional().describe("Filter by tags (AND logic)"),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  response_format: z.enum(["markdown", "json"]).default("markdown"),
}).strict();

export const GetNoteSchema = z.object({
  id: z.string().describe("Note ID from search results"),
  response_format: z.enum(["markdown", "json"]).default("markdown"),
}).strict();

export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(200).describe("Note title"),
  content: z.string().describe("Note body in Markdown format"),
  notebook: z.string().optional().describe("Notebook to create in. If omitted, inferred from content or defaults to 'OpenClaw'"),
  tags: z.array(z.string()).optional().describe("Tags to apply"),
}).strict();

// Refinement applied manually in handler
export const UpdateNoteSchema = z.object({
  id: z.string().describe("Note ID to update"),
  content: z.string().optional().describe("New note body (replaces existing)"),
  append: z.string().optional().describe("Text to append to existing content"),
  title: z.string().min(1).max(200).optional().describe("New title"),
  tags: z.array(z.string()).optional().describe("Replace tags list"),
}).strict();

export const ListNotebooksSchema = z.object({
  include_disabled: z.boolean().default(false).describe("Include notebooks not enabled for OpenClaw access"),
  response_format: z.enum(["markdown", "json"]).default("markdown"),
}).strict();

export const ConfigureNotebookAccessSchema = z.object({
  notebook: z.string().describe("Notebook name to configure"),
  enabled: z.boolean().describe("True to grant OpenClaw access, false to revoke"),
}).strict();

export const GetTodoSchema = z.object({
  response_format: z.enum(["markdown", "json"]).default("markdown"),
}).strict();

// Refinement applied manually in handler
export const UpdateTodoSchema = z.object({
  add: z.array(z.string()).optional().describe("Items to add to the to-do list"),
  complete: z.array(z.string()).optional().describe("Item text snippets to mark as done (partial match)"),
  remove: z.array(z.string()).optional().describe("Item text snippets to remove entirely (partial match)"),
  replace_all: z.array(z.string()).optional().describe("Replace entire list with these items"),
}).strict();

export const TriggerSyncSchema = z.object({}).strict();
