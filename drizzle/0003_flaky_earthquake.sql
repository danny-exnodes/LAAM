CREATE TABLE "chat_tool_call" (
	"id" text PRIMARY KEY NOT NULL,
	"conversationId" text NOT NULL,
	"messageId" text,
	"seq" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"args" jsonb,
	"result" jsonb,
	"ok" boolean DEFAULT true NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "summarizedThroughId" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "proactiveState" jsonb;--> statement-breakpoint
ALTER TABLE "chat_tool_call" ADD CONSTRAINT "chat_tool_call_conversationId_chat_conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."chat_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_call" ADD CONSTRAINT "chat_tool_call_messageId_chat_message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;