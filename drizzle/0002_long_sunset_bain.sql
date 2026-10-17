CREATE TABLE `invoice` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`sequence` int NOT NULL,
	`number` varchar(32) NOT NULL,
	`booking_request_id` int NOT NULL,
	`snapshot` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoice_year_sequence` UNIQUE(`year`,`sequence`),
	CONSTRAINT `invoice_number` UNIQUE(`number`),
	CONSTRAINT `invoice_booking_request` UNIQUE(`booking_request_id`)
);
--> statement-breakpoint
ALTER TABLE `invoice` ADD CONSTRAINT `invoice_booking_request_id_booking_request_id_fk` FOREIGN KEY (`booking_request_id`) REFERENCES `booking_request`(`id`) ON DELETE no action ON UPDATE no action;