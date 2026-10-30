-- A clip can end on a picture as well as start from one: `last_frame_file_id` is that picture's
-- files.id, null for pictures and for clips without a last frame.
ALTER TABLE `generations` ADD `last_frame_file_id` text;
