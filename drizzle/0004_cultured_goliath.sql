CREATE TABLE "workflow_run_step" (
	"id" text PRIMARY KEY NOT NULL,
	"runId" text NOT NULL,
	"nodeId" text NOT NULL,
	"parentStepId" text,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"tokensIn" integer DEFAULT 0 NOT NULL,
	"tokensOut" integer DEFAULT 0 NOT NULL,
	"costUsd" double precision DEFAULT 0 NOT NULL,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workflowId" text NOT NULL,
	"userId" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"graphSnapshot" jsonb NOT NULL,
	"context" jsonb,
	"error" text,
	"tokensIn" integer DEFAULT 0 NOT NULL,
	"tokensOut" integer DEFAULT 0 NOT NULL,
	"costUsd" double precision DEFAULT 0 NOT NULL,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph" jsonb NOT NULL,
	"isTemplate" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_run_step" ADD CONSTRAINT "workflow_run_step_runId_workflow_run_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflowId_workflow_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;