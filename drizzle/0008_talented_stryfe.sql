CREATE TABLE "workflow_node_idempotency" (
	"id" text PRIMARY KEY NOT NULL,
	"runId" text NOT NULL,
	"nodeId" text NOT NULL,
	"iterIndex" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"output" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_node_idem_key" UNIQUE("runId","nodeId","iterIndex")
);
--> statement-breakpoint
ALTER TABLE "workflow_node_idempotency" ADD CONSTRAINT "workflow_node_idempotency_runId_workflow_run_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;