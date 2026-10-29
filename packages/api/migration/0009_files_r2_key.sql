-- The daily sweep looks files up by their R2 key.
CREATE INDEX `files_r2_key` ON `files` (`r2_key`);
