CREATE TABLE `asl_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_asl_rooms_owner_key` ON `asl_rooms` (`owner_key`);--> statement-breakpoint
CREATE INDEX `idx_asl_rooms_expires_at` ON `asl_rooms` (`expires_at`);