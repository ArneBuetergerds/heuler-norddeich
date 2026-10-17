CREATE TABLE `push_subscription` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpoint` varchar(700) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_subscription_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscription_endpoint` UNIQUE(`endpoint`)
);
