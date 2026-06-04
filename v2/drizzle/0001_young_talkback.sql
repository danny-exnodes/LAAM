CREATE TABLE "connector_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"connectorId" text NOT NULL,
	"secret" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connector_user_id" UNIQUE("userId","connectorId")
);
--> statement-breakpoint
ALTER TABLE "connector_credential" ADD CONSTRAINT "connector_credential_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;