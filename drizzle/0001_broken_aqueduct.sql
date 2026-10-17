ALTER TABLE `booking_request` ADD `guests` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_request` ADD `linens` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_request` ADD `towels` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_request` ADD CONSTRAINT `booking_request_guests_range` CHECK (`booking_request`.`guests` >= 1 AND `booking_request`.`guests` <= 4);--> statement-breakpoint
ALTER TABLE `booking_request` ADD CONSTRAINT `booking_request_extras_range` CHECK (`booking_request`.`linens` >= 0 AND `booking_request`.`linens` <= `booking_request`.`guests`
          AND `booking_request`.`towels` >= 0 AND `booking_request`.`towels` <= `booking_request`.`guests`);