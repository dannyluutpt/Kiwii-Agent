-- Referrals: an account has a code to share; an account that signed up with one remembers whose it
-- was, and both are given credits when the invited account pays for its first plan.
ALTER TABLE `users` ADD `referral_code` text;--> statement-breakpoint
ALTER TABLE `users` ADD `referred_by` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_referral_code` ON `users` (`referral_code`);--> statement-breakpoint
CREATE INDEX `users_referred_by` ON `users` (`referred_by`);--> statement-breakpoint
ALTER TABLE `pending_signups` ADD `referred_by` text;
