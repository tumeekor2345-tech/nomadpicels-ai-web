import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// This file defines the structure of your database tables using the Drizzle ORM.

// To modify the database schema:
// 1. Update this file with your desired changes.
// 2. Generate a new migration by running: `npm run db:generate`

// The generated migration file will reflect your schema changes.
// It automatically run the command `db-server:file`, which apply the migration before Next.js starts in development mode,
// Alternatively, if your database is running, you can run `npm run db:migrate` and there is no need to restart the server.

// Need a database for production? Check out https://get.neon.com/BMFYNtx
// Tested and compatible with SaaS Boilerplate

export const todoSchema = pgTable('todo', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// Tracks every Flux/Wan 2.2 generation request: who asked for it, what the
// RunPod job id/status is, and (once completed) the raw RunPod output JSON.
// Used for: showing generation history on the Create page, and for the
// daily-usage rate limit in /api/generate (count rows per ownerId per day).
export const generationSchema = pgTable('generation', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(), // Clerk user id
  orgId: text('org_id'), // Clerk organization id (nullable — personal workspace)
  kind: text('kind').notNull(), // 'flux' | 'wan'
  prompt: text('prompt').notNull(),
  jobId: text('job_id').notNull(),
  status: text('status').notNull().default('IN_QUEUE'),
  // Raw `output` object from RunPod's job status response, JSON-stringified.
  // Kept raw (rather than a strict shape) because Wan 2.2's exact output
  // field names haven't been fully verified against a live response yet.
  outputJson: text('output_json'),
  errorMessage: text('error_message'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
