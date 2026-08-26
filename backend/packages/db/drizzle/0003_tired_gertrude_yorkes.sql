ALTER TABLE "projects" ADD COLUMN "max_clips" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "topic_filter" text;