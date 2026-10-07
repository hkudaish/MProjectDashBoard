// Runs only inside Netlify, using existing secrets without exposing their values.
const origin = "https://mproj-dashboard.netlify.app";
const password = process.env.ADMIN_PASSWORD;
const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
if (process.env.NETLIFY !== "true" || !password || emails.length === 0) {
  throw new Error("Production authentication verification requires the Netlify build environment.");
}

async function request(path, { cookie, body, requestOrigin = origin } = {}) {
  const headers = { Origin: requestOrigin };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
}
async function verifyAdmin(email) {
  const login = await request("/api/auth/login", { body: { email, password } });
  if (login.status !== 200) throw new Error(`Production login verification failed (HTTP ${login.status}).`);
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  try {
    if (!setCookie.includes("HttpOnly") || !setCookie.includes("Secure") || !setCookie.includes("SameSite=Strict")) {
      throw new Error("Production session cookie verification failed.");
    }
    const response = await request("/api/auth/session", { cookie });
    const session = await response.json();
    if (!response.ok || !session.configured || !session.isAdmin || session.email !== email) {
      throw new Error("Production authenticated session verification failed.");
    }
    const adminsResponse = await request("/api/auth/admins", { cookie });
    const admins = await adminsResponse.json();
    if (!adminsResponse.ok || !Array.isArray(admins.admins)) {
      throw new Error("Production admin access verification failed.");
    }
    return admins.admins;
  } finally {
    const logout = await request("/api/auth/logout", { cookie, body: {} });
    if (logout.status !== 200 || !logout.headers.get("set-cookie")?.includes("Max-Age=0")) {
      throw new Error("Production logout verification failed.");
    }
  }
}
const admins = await verifyAdmin(emails[0]);
if (!emails.every((email) => admins.includes(email))) throw new Error("An existing configured admin is missing.");
for (const email of admins) {
  if (email !== emails[0]) await verifyAdmin(email);
}
const anonymous = await request("/api/auth/session");
const anonymousSession = await anonymous.json();
if (!anonymousSession.configured || anonymousSession.isAdmin) throw new Error("Anonymous session verification failed.");
const rejected = await request("/api/auth/login", {
  requestOrigin: "https://invalid-origin.example",
  body: { email: "probe@example.invalid", password: "invalid" },
});
if (rejected.status !== 403) throw new Error("Foreign-origin protection verification failed.");
console.log(`ADMIN_LOGIN_VERIFIED ${JSON.stringify({ configured: true, verifiedAdminCount: admins.length, authenticatedSessions: true, logout: true, secureCookies: true, foreignOriginsRejected: true })}`);