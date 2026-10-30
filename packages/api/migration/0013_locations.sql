-- A location is a place saved from one to four photos, for every project of the account; a run set
-- in one names it in generations.location_id.
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`file_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `locations_user` ON `locations` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `generations` ADD `location_id` text;
