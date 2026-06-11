CREATE INDEX IF NOT EXISTS "agent_session_machine_updated_idx" ON "agent_session" USING btree ("machineId","updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_project_idx" ON "agent_session" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_status_idx" ON "agent_session" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_source_idx" ON "agent_session" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_user_idx" ON "agent_session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_conversation_created_idx" ON "chat_message" USING btree ("conversationId","createdAt");
