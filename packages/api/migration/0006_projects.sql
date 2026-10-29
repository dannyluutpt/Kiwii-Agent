CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_user` ON `projects` (`user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `generations` ADD `project_id` text;--> statement-breakpoint
CREATE INDEX `generations_project` ON `generations` (`user_id`,`project_id`,`id`);
