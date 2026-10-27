CREATE TABLE `plan_orders` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`amount_vnd` integer NOT NULL,
	`memo` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`paid_at` integer,
	`bank_event_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_orders_memo` ON `plan_orders` (`memo`);--> statement-breakpoint
CREATE INDEX `plan_orders_user` ON `plan_orders` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `bank_events` (
	`sepay_id` text PRIMARY KEY,
	`order_id` text,
	`amount` integer NOT NULL,
	`content` text NOT NULL,
	`raw` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_events` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`order_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_events_user` ON `plan_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_grants` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`amount` integer NOT NULL,
	`remaining` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credit_grants_user` ON `credit_grants` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`grant_id` text,
	`generation_id` text,
	`type` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credit_ledger_user` ON `credit_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `credit_ledger_generation` ON `credit_ledger` (`generation_id`);
