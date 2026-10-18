CREATE TABLE `party_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_party_rooms_owner_key` ON `party_rooms` (`owner_key`);--> statement-breakpoint
CREATE INDEX `idx_party_rooms_expires_at` ON `party_rooms` (`expires_at`);