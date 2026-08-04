CREATE TABLE `blocked_period` (
	`id` int AUTO_INCREMENT NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`note` text,
	`guest_name` text,
	`booking_request_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_period_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_period_guest_source` CHECK(NOT (`blocked_period`.`guest_name` IS NOT NULL AND `blocked_period`.`booking_request_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `booking_request` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`message` text,
	`status` enum('pending','confirmed','declined') NOT NULL DEFAULT 'pending',
	`reason_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `booking_request_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `blocked_period` ADD CONSTRAINT `blocked_period_booking_request_id_booking_request_id_fk` FOREIGN KEY (`booking_request_id`) REFERENCES `booking_request`(`id`) ON DELETE cascade ON UPDATE no action;