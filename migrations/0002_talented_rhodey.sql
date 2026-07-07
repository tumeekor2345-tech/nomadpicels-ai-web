CREATE TABLE "credit_balance" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"package_id" text NOT NULL,
	"amount_mnt" integer NOT NULL,
	"credits_granted" integer NOT NULL,
	"sender_invoice_no" text NOT NULL,
	"qpay_invoice_id" text,
	"qr_text" text,
	"qr_image" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_sender_invoice_no_unique" UNIQUE("sender_invoice_no")
);
