ALTER TABLE "chat_message" ADD COLUMN "tokensIn" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "tokensOut" integer DEFAULT 0 NOT NULL;