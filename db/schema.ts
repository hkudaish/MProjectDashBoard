import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    title: text("title").notNull(),
    plannedDate: text("planned_date").notNull(),
    endDate: text("end_date").notNull(),
    ownerType: text("owner_type").notNull(),
    assignee: text("assignee").notNull().default(""),
    status: text("status").notNull().default("not_started"),
    progress: integer("progress").notNull().default(0),
    notes: text("notes").notNull().default(""),
    sourceOrder: integer("source_order").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_product_id").on(table.productId),
    index("idx_tasks_owner_type").on(table.ownerType),
    index("idx_tasks_planned_date").on(table.plannedDate),
  ],
);
