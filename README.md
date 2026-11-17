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

## Admin login and write access

Task data can be viewed without signing in. Only allowlisted admins with a valid signed session can update tasks; the API rejects unauthorized `PATCH` requests independently of the UI. Admin sessions use an HttpOnly, Secure, SameSite cookie and expire after 12 hours.

Configure these environment variables in Netlify under **Project configuration → Environment variables**, for the production deploy context:

- `ADMIN_EMAILS`: comma-separated email addresses allowed to administer tasks.
- `ADMIN_PASSWORD`: a strong password shared by the configured admin accounts.
- `ADMIN_SESSION_SECRET`: a random secret of at least 32 characters used to sign sessions. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.

Save the variables and trigger a new production deploy. Until all three values are configured, the dashboard remains read-only and the API does not accept task edits. Do not commit these values or place them in `NEXT_PUBLIC_*` variables.

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

## Administrator backups and restore

Open **Settings → النسخ الاحتياطي والاستعادة** (`/settings/backups`) as an active system administrator who has completed the required password change.

- Create a full encrypted backup with a separate password of 12–128 characters. The file is downloaded and retained in backup history for later download. Passwords are not stored; a forgotten backup password cannot be recovered.
- Backups include tasks, products, projects, entities, user accounts and password hashes, additional administrator emails, registration requests, chat, activity history, and the encrypted Gmail connection record. Absent datasets are preserved as absent. Files use versioned JSON, AES-256-GCM encryption, scrypt key derivation, and checksum verification. The request/file limit is 4 MiB.
- To restore, upload a backup, enter its backup password, and review the before/after counts. Confirm with `استعادة` and verify the credentials of an active administrator contained in the selected backup. A preview expires after 10 minutes and must be repeated if application data changes.
- Before replacement, the system saves a recovery backup using the same backup password. Restore stages and verifies every dataset before switching the active generation atomically. Storage failures before that switch leave the current data active. Writers use a shared storage lease and stale writes cannot overwrite a restored generation. All account session versions advance and the restore is recorded in the activity log.
- Backup history and previous data generations are retained independently of restored application data. Download files to separate storage for recovery from loss of the Netlify site or local disk. Backup history itself is not recursively included in downloaded backups.
- Deployment environment variables, external service secrets, application source, and remote Gmail mailbox contents are not included. Preserve environment configuration separately; restoring a Gmail connection record on another environment requires the original encryption key and compatible Google configuration.

For persistent local operation, set `LOCAL_DATA_DIR=.local-data` in the ignored `.env.local`, then run `npm run dev`. This selects the Node/Next.js runtime on port 5173. Local records and backup archives stay under the ignored `.local-data` directory; production uses the site's Netlify Blobs store.

Before this feature was installed, a separate local recovery copy of all records and `.env.local` was saved under the ignored `work/backups/` directory, with SHA-256 hashes in its manifest. Keep the environment file private. That filesystem recovery copy is separate from the encrypted files accepted by the administrator restore page.

Run `npm test` for backup encryption, validation, access controls, recovery snapshots, restore failures, stale previews, and stale-writer coverage alongside the existing application tests.

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


## الهيكل الوظيفي

مدير النظام حساب تقني مستقل خارج الهيكل الإداري، ويحتفظ بإدارة الحسابات والإعدادات. لا يظهر في مسارات التبعية ولا في قوائم إسناد المهام.

| المنصب | المسؤول المباشر |
| --- | --- |
| الأمين العام | لا يوجد؛ أعلى الهيكل |
| مساعد الأمين العام | الأمين العام |
| مساعد الأمين العام للشؤون التنفيذية | الأمين العام |
| مدير الإدارة أو مدير المشروع | أحد المناصب القيادية الثلاثة |
| رئيس القسم | مدير إدارة |
| الموظف | رئيس قسم |

ابدأ بإنشاء الأمين العام، ثم المساعدين والمديرين، ثم رؤساء الأقسام والموظفين. يعرض نموذج المستخدم أسماء الحسابات النشطة المسجلة في منصب المسؤول المختار. اختيار الجهة ليس شرطًا لإنشاء الحساب. التبعية الإدارية اختيارية؛ يمكن حفظ المستخدم بدون مسؤول مباشر وربطه لاحقًا. عند اختيار مسؤول، يُسمح بمسؤول واحد مطابق لقواعد المنصب، باستثناء الأمين العام ومدير النظام اللذين لا يرتبطان بمسؤول.

يستطيع المسؤول إسناد المهام والصفوف التفصيلية إلى مرؤوسيه المباشرين وغير المباشرين فقط. لا تمنح التبعية القديمة لمدير النظام أو التبعية الإضافية القديمة صلاحية إسناد. تبقى الحسابات السابقة وكلمات مرورها ومعرفاتها وسجلات مهامها محفوظة؛ تُعرض التبعيات المخالفة للهيكل الجديد لإصلاحها من إدارة المستخدمين.
