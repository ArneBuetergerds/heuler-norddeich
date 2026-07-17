ALTER TABLE "blocked_period" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "blocked_period" ADD COLUMN "booking_request_id" integer;--> statement-breakpoint
ALTER TABLE "booking_request" ADD COLUMN "reason_note" text;--> statement-breakpoint
ALTER TABLE "blocked_period" ADD CONSTRAINT "blocked_period_booking_request_id_booking_request_id_fk" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_period" ADD CONSTRAINT "blocked_period_guest_source" CHECK (NOT ("blocked_period"."guest_name" IS NOT NULL AND "blocked_period"."booking_request_id" IS NOT NULL));