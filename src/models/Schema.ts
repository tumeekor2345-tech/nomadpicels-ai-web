import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

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

// One row per Clerk user — their current generation-credit balance.
// Credited by the QPay webhook when an order's invoice is paid; debited by
// /api/generate before submitting a RunPod job (flux = 1 credit, wan = 8).
export const creditBalanceSchema = pgTable('credit_balance', {
  ownerId: text('owner_id').primaryKey(), // Clerk user id
  balance: integer('balance').notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Short-lived storage for user-uploaded images that a RunPod worker needs
// to fetch over a real HTTPS URL (not embedded base64) — e.g. the Face
// Swap tool's `image_url` field. RunPod's comfyui-faceswap-sdxl endpoint
// sits behind a WAF that blocks requests carrying a large embedded
// data:-URI (observed 2026-07-15: "[BLOCKED: Cookie/query string data]"),
// so uploaded photos are POSTed to /api/uploads first, stored here, and
// served back out via GET /api/uploads/[token] as a plain image response
// that RunPod can fetch like any other public image URL. `token` is a
// random UUID (not the row id) so the URL isn't guessable. No auth is
// required on the GET route since RunPod's server can't send our cookies —
// unguessable token is the only protection, same trade-off as any
// anonymous file-hosting link.
// NOTE: rows are never cleaned up automatically yet — fine at current
// volume, but worth adding a scheduled delete-older-than-24h job later.
export const tempUploadSchema = pgTable('temp_upload', {
  token: text('token').primaryKey(),
  ownerId: text('owner_id').notNull(), // Clerk user id
  contentType: text('content_type').notNull(),
  data: text('data').notNull(), // raw bytes, base64-encoded
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// One row per credit-package purchase attempt. Created as 'PENDING' the
// moment we call QPay's create-invoice endpoint; flipped to 'PAID' by the
// /api/webhooks/qpay callback route once QPay confirms the invoice was
// actually paid (server-verified via confirmQPayPayment, never trusted from
// the callback body alone).
export const orderSchema = pgTable('order', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(), // Clerk user id
  orgId: text('org_id'), // Clerk organization id (nullable)
  packageId: text('package_id').notNull(), // see src/libs/Pricing.ts
  amountMnt: integer('amount_mnt').notNull(),
  creditsGranted: integer('credits_granted').notNull(),
  senderInvoiceNo: text('sender_invoice_no').notNull().unique(),
  qpayInvoiceId: text('qpay_invoice_id'),
  qrText: text('qr_text'), // raw QR payload — client renders this as a QR code
  qrImage: text('qr_image'), // base64 QR image QPay returns, if provided
  status: text('status').notNull().default('PENDING'), // PENDING | PAID | CANCELLED | EXPIRED
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
