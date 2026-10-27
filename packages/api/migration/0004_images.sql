CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`option` text NOT NULL,
	`aspect_ratio` text NOT NULL,
	`n` integer NOT NULL,
	`prompt_raw` text NOT NULL,
	`prompt_enhanced` text,
	`enhance` integer DEFAULT 1 NOT NULL,
	`reference_file_ids` text DEFAULT '[]' NOT NULL,
	`credits_reserved` integer NOT NULL,
	`credits_final` integer,
	`cost_usd` real,
	`error` text,
	`finished_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `generations_user` ON `generations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `generations_status` ON `generations` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `generation_images` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`file_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `generation_images_generation` ON `generation_images` (`generation_id`);--> statement-breakpoint
CREATE INDEX `generation_images_user` ON `generation_images` (`user_id`,`created_at`);
