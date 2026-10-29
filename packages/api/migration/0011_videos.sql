-- Videos are runs too: one clip per run, its file a video/mp4. `duration` is the clip's length in
-- seconds and `job_id` the OpenRouter video job the run waits on; both stay null for pictures.
ALTER TABLE `generations` ADD `kind` text DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE `generations` ADD `duration` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `job_id` text;
