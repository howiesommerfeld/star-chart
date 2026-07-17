CREATE TABLE `behaviours` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`emoji` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`period_id` integer NOT NULL,
	`kid_id` integer NOT NULL,
	`day_no` integer NOT NULL,
	`tiles` text NOT NULL,
	`flipped_index` integer,
	`flipped_at` text,
	PRIMARY KEY(`period_id`, `kid_id`, `day_no`),
	FOREIGN KEY (`period_id`) REFERENCES `periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kid_id`) REFERENCES `kids`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kids` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_id` integer NOT NULL,
	`kid_id` integer NOT NULL,
	`day_no` integer,
	`type` text NOT NULL,
	`points_delta` integer DEFAULT 0 NOT NULL,
	`peeks_delta` integer DEFAULT 0 NOT NULL,
	`meta` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kid_id`) REFERENCES `kids`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ledger_day_events` ON `ledger` (`period_id`,`kid_id`,`day_no`,`type`) WHERE type IN ('flip','checkpoint');--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ledger_grand_reward` ON `ledger` (`period_id`,`kid_id`) WHERE type = 'grand_reward';--> statement-breakpoint
CREATE TABLE `night_behaviours` (
	`period_id` integer NOT NULL,
	`kid_id` integer NOT NULL,
	`day_no` integer NOT NULL,
	`behaviour_id` integer NOT NULL,
	PRIMARY KEY(`period_id`, `kid_id`, `day_no`, `behaviour_id`),
	FOREIGN KEY (`behaviour_id`) REFERENCES `behaviours`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nights` (
	`period_id` integer NOT NULL,
	`kid_id` integer NOT NULL,
	`day_no` integer NOT NULL,
	`status` text NOT NULL,
	`graced` integer DEFAULT false NOT NULL,
	`confirmed_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`period_id`, `kid_id`, `day_no`),
	FOREIGN KEY (`period_id`) REFERENCES `periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kid_id`) REFERENCES `kids`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`starts_on` text NOT NULL,
	`length_days` integer NOT NULL,
	`timezone` text NOT NULL,
	`wake_hour` integer DEFAULT 5 NOT NULL,
	`x_required` integer NOT NULL,
	`grace_tokens` integer NOT NULL,
	`checkpoint_days` text NOT NULL,
	`grid_w` integer DEFAULT 4 NOT NULL,
	`grid_h` integer DEFAULT 4 NOT NULL,
	`tile_values` text NOT NULL,
	`checkpoint_bonus_points` integer DEFAULT 20 NOT NULL,
	`checkpoint_bonus_peeks` integer DEFAULT 1 NOT NULL,
	`peek_cap` integer DEFAULT 3 NOT NULL,
	`grand_reward` text NOT NULL,
	`seed` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
