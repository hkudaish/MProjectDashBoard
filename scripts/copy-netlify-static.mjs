import { cpSync, mkdirSync } from "node:fs";

// Netlify's current Next.js adapter bundles the server handler correctly but
// can omit Turbopack's static chunks for this Next.js release. Copy them into
// the deploy output so the browser can hydrate the dashboard.
mkdirSync(".netlify/static/_next", { recursive: true });
cpSync(".next/static", ".netlify/static/_next/static", {
  recursive: true,
  force: true,
});

console.log("Copied Next.js static chunks into the Netlify deploy output.");
