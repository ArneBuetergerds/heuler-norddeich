CREATE TABLE `admin_action_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`actor` varchar(320) NOT NULL,
	`action` varchar(32) NOT NULL,
	`booking_request_id` int,
	`blocked_period_id` int,
	`details` json,
	CONSTRAINT `admin_action_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `booking_request` ADD `decided_at` timestamp;--> statement-breakpoint
ALTER TABLE `booking_request` ADD `anonymized_at` timestamp;--> statement-breakpoint
CREATE INDEX `admin_action_log_created_at` ON `admin_action_log` (`created_at`);