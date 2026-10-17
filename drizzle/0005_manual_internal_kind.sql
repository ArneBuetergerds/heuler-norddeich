ALTER TABLE `blocked_period` ADD `kind` enum('booking','block','internal','legacy_stay') DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE `booking_request` ADD `source` enum('online','manual') DEFAULT 'online' NOT NULL;--> statement-breakpoint
UPDATE `blocked_period` SET `kind` = 'booking' WHERE `booking_request_id` IS NOT NULL;--> statement-breakpoint
UPDATE `blocked_period` SET `kind` = 'legacy_stay' WHERE `guest_name` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `blocked_period` ADD CONSTRAINT `blocked_period_kind_booking` CHECK ((`blocked_period`.`kind` = 'booking') = (`blocked_period`.`booking_request_id` IS NOT NULL));--> statement-breakpoint
ALTER TABLE `blocked_period` ADD CONSTRAINT `blocked_period_kind_legacy_stay` CHECK ((`blocked_period`.`kind` = 'legacy_stay') = (`blocked_period`.`guest_name` IS NOT NULL));