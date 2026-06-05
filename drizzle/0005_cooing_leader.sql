CREATE TABLE "eval_run" (
	"id" text PRIMARY KEY NOT NULL,
	"ranAt" timestamp DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	"k" integer DEFAULT 1 NOT NULL,
	"label" text,
	"gitSha" text,
	"totalScenarios" integer DEFAULT 0 NOT NULL,
	"totalRuns" integer DEFAULT 0 NOT NULL,
	"dims" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
