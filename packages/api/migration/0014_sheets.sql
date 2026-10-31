-- A sheet run makes one picture laid out in panels, to be cut into the photos a character (or later a
-- location) is saved with: `sheet` names which kind, null for every other run. Sheets show in the
-- Library and on the page that made them, not in the studio's gallery.
ALTER TABLE `generations` ADD `sheet` text;
