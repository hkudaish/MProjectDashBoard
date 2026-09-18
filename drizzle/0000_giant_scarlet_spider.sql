CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`title` text NOT NULL,
	`planned_date` text NOT NULL,
	`end_date` text NOT NULL,
	`owner_type` text NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`source_order` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_product_id` ON `tasks` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_type` ON `tasks` (`owner_type`);--> statement-breakpoint
CREATE INDEX `idx_tasks_planned_date` ON `tasks` (`planned_date`);