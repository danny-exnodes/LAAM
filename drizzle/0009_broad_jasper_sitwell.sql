CREATE TABLE "access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"last4" text NOT NULL,
	"tokenHash" text NOT NULL,
	"scopes" jsonb,
	"machineId" text,
	"lastUsedAt" timestamp,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_token_hash_key" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "agent_session" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_machineId_machine_id_fk" FOREIGN KEY ("machineId") REFERENCES "public"."machine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;