# MProjectDashBoard

A project dashboard for tracking media and content production tasks across multiple workstreams. The app presents a task-oriented overview, status metrics, filtering, and timeline views for planning and execution.

## Overview

This dashboard is built with Next.js and includes:

- a task dashboard UI for managing project work
- filters by product area, status, and owner
- progress and timing indicators
- a task detail editor for updates
- persistent storage for task data

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Cloudflare / Vinext-compatible runtime
- Drizzle + D1 support for optional database persistence
- Netlify Blobs for app storage in the current implementation

## Storage system

The app stores task records in the backend route at [app/api/tasks/route.ts](app/api/tasks/route.ts).

Current behavior:

- uses `@netlify/blobs` via `getStore("wamy-task-dashboard")`
- reads and writes tasks as JSON under a single `tasks` key
- seeds default tasks if no data exists
- supports `GET` and `PATCH` for reading and updating task records

There is also a D1/Drizzle layer prepared for a more structured database-backed setup:

- [db/index.ts](db/index.ts)
- [db/schema.ts](db/schema.ts)
- [drizzle.config.ts](drizzle.config.ts)

## Local development

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

## Project structure

```text
app/                  # App routes and dashboard UI
components/          # Reusable UI components
db/                  # D1/Drizzle database connection and schema
drizzle/             # Migration SQL and metadata
lib/                 # Task types and seed data
scripts/             # Runtime and setup scripts
public/              # Static assets
```

## Notes

The dashboard currently persists task data in the app storage layer and is ready for a D1-backed model if you want to move from blob storage to a relational database later.

## Verification

This project has been verified to build successfully with:

```bash
npm run build
```

The build completed successfully in the local workspace on 2026-09-18.
