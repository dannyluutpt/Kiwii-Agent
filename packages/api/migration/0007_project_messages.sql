CREATE TABLE `project_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_usd` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_messages_project` ON `project_messages` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `project_messages_user` ON `project_messages` (`user_id`,`created_at`);
