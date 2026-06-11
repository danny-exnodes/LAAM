CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"audience" text,
	"type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"source" text NOT NULL,
	"readAt" timestamp,
	"dedupeKey" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_read_created_idx" ON "notification" USING btree ("userId","readAt","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_user_dedupe_key" ON "notification" USING btree ("userId","dedupeKey") WHERE "notification"."dedupeKey" is not null;