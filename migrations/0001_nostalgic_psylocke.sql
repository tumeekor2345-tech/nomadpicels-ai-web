CREATE TABLE "generation" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"kind" text NOT NULL,
	"prompt" text NOT NULL,
	"job_id" text NOT NULL,
	"status" text DEFAULT 'IN_QUEUE' NOT NULL,
	"output_json" text,
	"error_message" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
