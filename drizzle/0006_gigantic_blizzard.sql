CREATE TABLE "workflow_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"workflowId" text NOT NULL,
	"userId" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"catchupPolicy" text DEFAULT 'skip' NOT NULL,
	"nextRunAt" timestamp,
	"lastRunAt" timestamp,
	"missedCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN "scheduleId" text;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN "scheduledFor" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_schedule" ADD CONSTRAINT "workflow_schedule_workflowId_workflow_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule" ADD CONSTRAINT "workflow_schedule_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_scheduleId_workflow_schedule_id_fk" FOREIGN KEY ("scheduleId") REFERENCES "public"."workflow_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_schedule_slot" UNIQUE("scheduleId","scheduledFor");