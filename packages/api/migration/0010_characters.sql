-- A character is a person (or a mascot) saved from one to four photos, for every project of the
-- account; runs that feature one list it in generations.character_ids.
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`file_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `characters_user` ON `characters` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `generations` ADD `character_ids` text DEFAULT '[]' NOT NULL;
