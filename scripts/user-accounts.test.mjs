import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { beforeEach, test } from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const data = new Map();
let revision = 0;
let writes = 0;
const store = {
  async get(key) { return structuredClone(data.get(key)?.value ?? null); },
  async getWithMetadata(key) { const row = data.get(key); return row ? { data: structuredClone(row.value), etag: row.etag } : null; },
  async setJSON(key, value, options = {}) {
    const existing = data.get(key);
    if (options.onlyIfNew && existing || options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++revision); data.set(key, { value: structuredClone(value), etag }); writes++;
    return { modified: true, etag };
  },
};
const seed = { id: "task-1", productId: "digital", productName: "المحتوى الرقمي", title: "مهمة", plannedDate: "2026-10-08", endDate: "2026-10-09", status: "not_started", progress: 0, ownerType: "unassigned", assignee: "", notes: "", sourceOrder: 1, updatedAt: "2026-10-08" };
const stubs = { "@netlify/blobs": { getStore: () => store }, "zod": { z: require("zod").z }, "node:crypto": require("node:crypto"), "node:util": require("node:util"), "@/lib/task-data": { DEFAULT_TASKS: [seed] } };
const cache = new Map();
const gmailSent = [];
stubs["nodemailer"] = { default: require("nodemailer") };
function configureGmail() {
  process.env.GMAIL_USER="hkudaish@gmail.com";
  process.env.GOOGLE_CLIENT_ID="test-client"; process.env.GOOGLE_CLIENT_SECRET="test-secret";
  process.env.GOOGLE_REDIRECT_URI=origin+"/api/mailbox/callback"; process.env.GOOGLE_REFRESH_TOKEN="test-refresh";
  globalThis.fetch=async (url, options={})=>{
    const path=String(url);
    if(path==="https://oauth2.googleapis.com/token")return Response.json({access_token:"test-access",refresh_token:"new-refresh",scope:"https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"});
    assert.ok(path.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/"));
    assert.equal(options.headers.Authorization,"Bearer test-access");
    if(path.endsWith("/profile"))return Response.json({emailAddress:"hkudaish@gmail.com"});
    if(path.endsWith("/messages/send")) {const body=JSON.parse(options.body);gmailSent.push({...body,parsed:await require("mailparser").simpleParser(Buffer.from(body.raw,"base64url"))});return Response.json({id:"sent-api-id"});}
    if(path.includes("/messages?")) { const query=new URL(path).searchParams;assert.equal(query.get("q"),'subject:"MProjDashboard"');assert.equal(query.get("labelIds"),"INBOX");return Response.json({messages:[{id:"abc123"}],nextPageToken:"page_2"}); }
    if(path.includes("/messages/abc123")) {
      if(path.includes("format=raw"))return Response.json({id:"abc123",threadId:"thread1",labelIds:["INBOX","UNREAD"],raw:Buffer.from("From: Sender <sender@example.com>\r\nReply-To: support@example.com\r\nTo: hkudaish@gmail.com\r\nSubject: [MProjDashboard] Test message\r\nMessage-ID: <original@example.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nOriginal message text").toString("base64url")});
      return Response.json({id:"abc123",sizeEstimate:1024,internalDate:"1791720000000",labelIds:["INBOX","UNREAD"],snippet:"Original message preview",payload:{headers:[{name:"Subject",value:"[MProjDashboard] Test message"},{name:"From",value:"sender@example.com"}]}});
    }
    return new Response(null,{status:404});
  };
}
stubs["mailparser"] = { simpleParser: require("mailparser").simpleParser };
stubs["./local-store"] = { getLocalStore: () => null };
async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const sourceModule = new vm.SourceTextModule(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const linked = sourceModule.link((specifier) => {
    if (stubs[specifier]) { const values = stubs[specifier]; return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }); }
    return load(specifier.startsWith("@/") ? resolve(root, specifier.slice(2) + ".ts") : resolve(dirname(path), specifier + ".ts"));
  });
  const ready = linked.then(() => sourceModule);
  cache.set(path, ready);
  return ready;
}
async function exports(path) { const sourceModule = await load(resolve(root, path)); await sourceModule.evaluate(); return sourceModule.namespace; }
const accounts = await exports("lib/user-accounts.ts");
const auth = await exports("lib/admin-auth.ts");
const login = await exports("app/api/auth/login/route.ts");
const users = await exports("app/api/auth/users/route.ts");
const legacy = await exports("app/api/auth/admins/route.ts");
const password = await exports("app/api/auth/password/route.ts");
const registrationRoute = await exports("app/api/registration-requests/route.ts");
const registrationService = await exports("lib/registration-requests.ts");
const chatRoute = await exports("app/api/chat/route.ts");
const activityRoute = await exports("app/api/activity/route.ts");
const userNotifyRoute = await exports("app/api/auth/users/notify/route.ts");
const originalFetch = globalThis.fetch;
const mailboxRoute = await exports("app/api/mailbox/route.ts");
const gmailApi = await exports("lib/gmail-api.ts");
const gmailConnect = await exports("app/api/mailbox/connect/route.ts");
const gmailCallback = await exports("app/api/mailbox/callback/route.ts");
const reset = await exports("app/api/auth/password-reset/route.ts");
const session = await exports("app/api/auth/session/route.ts");
const tasks = await exports("app/api/tasks/route.ts");
const products = await exports("app/api/products/route.ts");
const projects = await exports("app/api/projects/route.ts");
const oldPassword = "LegacyPassword123";
const personalPassword = "PersonalPassword456";
const temporaryPassword = "TemporaryPassword789";
const origin = "https://example.com";
function request(body, cookie = "", method = "POST", suppliedOrigin = origin) {
  return new Request(`${origin}/api`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}) }, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
}
function cookie(response) { return response.headers.get("set-cookie").split(";")[0]; }
async function signIn(email, value) { return login.POST(request({ email, password: value })); }
async function adminCookie() {
  const first = await signIn("admin@example.com", oldPassword); assert.equal(first.status, 200);
  const changed = await password.POST(request({ currentPassword: oldPassword, newPassword: personalPassword }, cookie(first)));
  assert.equal(changed.status, 200); return cookie(changed);
}
let leaderSetup;
async function ensureLeader(admin) {
  leaderSetup ??= positioned(admin, "leader@example.com", "secretary_general", null, null);
  await leaderSetup;
}
async function newUser(admin, email, role = "editor") {
  await ensureLeader(admin);
  const position = email === "test-manager@example.com" ? "section_head" : role === "admin" ? "system_admin" : role === "editor" ? "project_manager" : "employee";
  if (position === "section_head" && !await accounts.findAccount("test-department@example.com")) await positioned(admin, "test-department@example.com", "department_manager", "leader@example.com");
  if (position === "employee" && !await accounts.findAccount("test-manager@example.com")) await newUser(admin, "test-manager@example.com");
  const response = await users.POST(request({ email, name: "User", position, managerEmail: position === "system_admin" ? null : position === "employee" ? "test-manager@example.com" : position === "section_head" ? "test-department@example.com" : "leader@example.com", password: temporaryPassword }, admin));
  assert.equal(response.status, 201, await response.clone().text()); return response;
}
beforeEach(() => {
  gmailSent.length = 0;
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_REDIRECT_URI; delete process.env.GOOGLE_REFRESH_TOKEN; delete process.env.GMAIL_TOKEN_SECRET;
  delete process.env.GMAIL_APP_PASSWORD; delete process.env.GMAIL_USER; delete process.env.REGISTRATION_MAIL_PROVIDER;
  globalThis.fetch = originalFetch;
  delete process.env.RESEND_API_KEY; delete process.env.REGISTRATION_MAIL_FROM;
  data.clear(); revision = 0; writes = 0; leaderSetup = undefined;
  process.env.NODE_ENV = "production"; delete process.env.TASK_STORE_MODE;
  process.env.ADMIN_EMAILS = "admin@example.com,other@example.com";
  process.env.ADMIN_PASSWORD = oldPassword;
  process.env.ADMIN_SESSION_SECRET = "test-session-secret-32-characters-minimum-only";
  process.env.URL = origin;
  data.set("admin-emails", { etag: "legacy", value: ["stored@example.com"] });
});
async function chatUser(admin, email, name) {
  const response=await users.POST(request({email,name,position:"employee",entityId:"wamy",password:temporaryPassword},admin));assert.equal(response.status,201);
  const first=await signIn(email,temporaryPassword);
  const changed=await password.POST(request({currentPassword:temporaryPassword,newPassword:personalPassword},cookie(first)));assert.equal(changed.status,200);return cookie(changed);
}
test("user welcome notification is administrator-only, sends to the saved login alias and preserves credentials", async () => {
  const admin=await adminCookie(), employee=await chatUser(admin,"alice@example.com","Alice");
  configureGmail();process.env.REGISTRATION_MAIL_PROVIDER="gmail";
  await store.setJSON("projects",[{id:"notice-project",name:"مشروع الإشعار",description:""}]);
  await users.PATCH(request({email:"alice@example.com",newEmail:"alice-login@example.com"},admin,"PATCH"));
  const original=await accounts.findAccount("alice@example.com");
  const input={email:"alice@example.com",projectId:"notice-project"};
  assert.equal((await userNotifyRoute.POST(request(input))).status,403);
  assert.equal((await userNotifyRoute.POST(request(input,employee))).status,403);
  assert.equal((await userNotifyRoute.POST(request(input,admin,"POST","https://foreign.example"))).status,403);
  assert.equal((await userNotifyRoute.POST(request({...input,to:"attacker@example.com"},admin))).status,400);
  assert.equal((await userNotifyRoute.POST(request({...input,projectId:"missing"},admin))).status,400);
  assert.equal(gmailSent.length,0);
  assert.equal((await userNotifyRoute.POST(request(input,admin))).status,200);
  assert.equal(gmailSent[0].parsed.to.value[0].address,"alice-login@example.com");assert.ok(gmailSent[0].parsed.subject.includes("مشروع الإشعار"));
  assert.ok(gmailSent[0].parsed.text.includes("كلمة المرور الخاصة بحسابك"));assert.ok(!gmailSent[0].parsed.text.includes("نفس البريد الإلكتروني"));
  assert.deepEqual(await accounts.findAccount("alice@example.com"),original);
  assert.ok(data.get("activity-log-v1").value.some(entry=>entry.action==="إرسال إشعار ترحيبي للمستخدم"));
  await users.PATCH(request({email:"alice@example.com",active:false},admin,"PATCH"));
  assert.equal((await userNotifyRoute.POST(request(input,admin))).status,400);assert.equal(gmailSent.length,1);
});
test("welcome notification describes email initial passwords accurately and reports mail delivery failure", async () => {
  const admin=await adminCookie();configureGmail();process.env.REGISTRATION_MAIL_PROVIDER="gmail";
  await accounts.createUser({email:"new@example.com",name:"New user",position:"employee",entityId:"wamy",managerEmail:null,additionalManagerEmail:null,password:"IgnoredPassword123",registrationRequestId:"00000000-0000-4000-8000-000000000001"});
  const original=await accounts.findAccount("new@example.com");
  const input={email:"new@example.com",projectId:"media-project"};
  // Use the persisted default project rather than trusting a client title.
  const projects=await exports("lib/projects.ts");input.projectId=projects.DEFAULT_PROJECT.id;
  assert.equal((await userNotifyRoute.POST(request(input,admin))).status,200);
  assert.ok(gmailSent[0].parsed.text.includes("كلمة المرور لأول دخول: نفس البريد الإلكتروني (new@example.com)"));
  assert.ok(gmailSent[0].parsed.text.includes("تغيير كلمة المرور مباشرةً"));assert.ok(gmailSent[0].parsed.text.includes(origin));
  assert.deepEqual(await accounts.findAccount("new@example.com"),original);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>String(url).endsWith("/messages/send")?Response.json({error:"failed"},{status:503}):originalFetch(url,options);
  assert.equal((await userNotifyRoute.POST(request(input,admin))).status,503);
  assert.deepEqual(await accounts.findAccount("new@example.com"),original);
});
function chatGet(user, query="") { return chatRoute.GET(new Request(origin+"/api/chat"+query,{headers:{cookie:user}})); }
test("chat is private to participants, counts unread messages, and requires a changed-password session", async () => {
  const admin=await adminCookie(), a=await chatUser(admin,"alice@example.com","Alice"), b=await chatUser(admin,"bob@example.com","Bob"), c=await chatUser(admin,"carol@example.com","Carol");
  assert.equal((await chatGet("")).status,403);
  await users.POST(request({email:"temporary@example.com",name:"Temporary",position:"employee",password:temporaryPassword},admin));
  assert.equal((await chatGet(cookie(await signIn("temporary@example.com",temporaryPassword)))).status,403);
  assert.equal((await chatRoute.POST(request({recipient:"bob@example.com",text:"Private message"},a,"POST","https://foreign.example"))).status,403);
  assert.equal((await chatRoute.POST(request({recipient:"bob@example.com",text:"Private message",sender:"carol@example.com"},a))).status,400);
  const sent=await chatRoute.POST(request({recipient:"bob@example.com",text:"Private message"},a));assert.equal(sent.status,201);
  const message=(await sent.json()).message;
  assert.equal((await(await chatGet(b)).json()).unread,1);assert.equal((await(await chatGet(a)).json()).unread,0);
  assert.equal((await(await chatGet(c,"?peer=bob@example.com")).json()).messages.length,0);
  assert.equal((await chatGet(c,"?supervise=1")).status,403);
  assert.equal((await chatRoute.PATCH(request({id:message.id,action:"edit",text:"Forged"},b,"PATCH"))).status,403);
  assert.equal((await chatRoute.PUT(request({peer:"alice@example.com"},b,"PUT"))).status,200);
  assert.equal((await(await chatGet(b)).json()).unread,0);
  assert.ok((await(await chatGet(a,"?peer=bob@example.com")).json()).messages[0].readAt);
  await users.PATCH(request({email:"bob@example.com",active:false},admin,"PATCH"));
  assert.equal((await chatRoute.POST(request({recipient:"bob@example.com",text:"Inactive"},a))).status,400);
});
test("chat edit and recall stop at exactly one minute; personal deletion and administrator removal have separate scopes", async () => {
  const admin=await adminCookie(), a=await chatUser(admin,"alice@example.com","Alice"), b=await chatUser(admin,"bob@example.com","Bob");
  const message=(await(await chatRoute.POST(request({recipient:"bob@example.com",text:"First text"},a))).json()).message;
  const originalNow=Date.now, start=Date.parse(message.createdAt);
  try {
    Date.now=()=>start+59999;
    assert.equal((await chatRoute.PATCH(request({id:message.id,action:"edit",text:"Edited text"},a,"PATCH"))).status,200);
    Date.now=()=>start+60000;
    for(const action of ["edit","recall"]) assert.equal((await chatRoute.PATCH(request({id:message.id,action,text:"Too late"},a,"PATCH"))).status,400);
    assert.equal((await chatRoute.PATCH(request({id:message.id,action:"delete"},a,"PATCH"))).status,200);
    assert.equal((await(await chatGet(a,"?peer=bob@example.com")).json()).messages.length,0);
    assert.equal((await(await chatGet(b,"?peer=alice@example.com")).json()).messages[0].text,"Edited text");
    assert.equal((await chatRoute.PATCH(request({id:message.id,action:"remove"},b,"PATCH"))).status,403);
    assert.equal((await(await chatGet(admin,"?supervise=1")).json()).messages[0].text,"Edited text");
    assert.equal((await chatRoute.PATCH(request({id:message.id,action:"remove"},admin,"PATCH"))).status,200);
    const removed=(await(await chatGet(b,"?peer=alice@example.com")).json()).messages[0];assert.equal(removed.text,"");assert.ok(removed.removedAt);
    assert.equal((await(await chatGet(b)).json()).unread,0);
  } finally { Date.now=originalNow; }
  const second=(await(await chatRoute.POST(request({recipient:"bob@example.com",text:"Recall me"},a))).json()).message;
  assert.equal((await chatRoute.PATCH(request({id:second.id,action:"recall"},a,"PATCH"))).status,200);
  const recalled=(await(await chatGet(b,"?peer=alice@example.com")).json()).messages.find(m=>m.id===second.id);assert.ok(recalled.recalledAt);assert.equal(recalled.text,"");
});
test("concurrent chat sends survive persistence and audit logs protect identities and administrator-only deletion", async () => {
  const admin=await adminCookie(), a=await chatUser(admin,"alice@example.com","Alice"), b=await chatUser(admin,"bob@example.com","Bob");
  const responses=await Promise.all(Array.from({length:5},(_,i)=>chatRoute.POST(request({recipient:"bob@example.com",text:"Sensitive chat text "+i},a))));assert.ok(responses.every(r=>r.status===201));
  assert.equal((await(await chatGet(b)).json()).unread,5);
  const own=await(await activityRoute.GET(request(null,a,"GET"))).json();assert.ok(own.entries.some(e=>e.action==="إرسال رسالة"));assert.ok(own.entries.every(e=>e.actorEmail==="alice@example.com"));
  const all=await(await activityRoute.GET(request(null,admin,"GET"))).json();assert.ok(all.entries.some(e=>e.actorName==="Alice"));assert.ok(all.entries.every(e=>e.id&&e.action&&e.createdAt&&e.actorName));
  assert.ok(!JSON.stringify(all).includes(personalPassword));assert.ok(!JSON.stringify(all).includes("Sensitive chat text"));
  assert.equal((await activityRoute.DELETE(request({},a,"DELETE"))).status,403);
  assert.equal((await activityRoute.DELETE(request({},admin,"DELETE","https://foreign.example"))).status,403);
  assert.equal((await activityRoute.DELETE(request({},admin,"DELETE"))).status,200);
  const cleared=await(await activityRoute.GET(request(null,admin,"GET"))).json();assert.equal(cleared.entries.length,1);assert.equal(cleared.entries[0].action,"مسح سجل العمليات");
});

test("registration is public, validated and deduplicated, and review data stays private", async () => {
  const admin=await adminCookie();
  const input={name:"Applicant",jobTitle:"مدير مشروع",department:"الندوة العالمية",entityId:"wamy",email:"applicant@example.com"};
  assert.equal((await registrationRoute.POST(request({...input,email:"invalid"}))).status,400);
  assert.equal((await registrationRoute.POST(request(input,"","POST","https://foreign.example"))).status,403);
  for(const response of await Promise.all([registrationRoute.POST(request(input)),registrationRoute.POST(request(input))])) assert.equal(response.status,201);
  assert.equal((await registrationRoute.GET(request(null,"","GET"))).status,403);
  const body=await(await registrationRoute.GET(request(null,admin,"GET"))).json();
  assert.equal(body.requests.length,1);assert.equal(body.mailConfigured,false);
  assert.equal(body.requests[0].status,"pending");
  assert.equal(body.requests[0].entityId,"wamy");
  assert.equal(body.requests[0].entityName,"الندوة العالمية");
  assert.ok(body.requests[0].notifications[0].text.includes("اسم الجهة: الندوة العالمية"));
  assert.ok(body.requests[0].notifications.every(item=>item.status==="queued"));
  assert.equal(await accounts.findAccount(input.email),null);
  assert.equal((await registrationRoute.PATCH(request({id:body.requests[0].id,status:"approved"}))).status,403);
});
test("registration requires an available entity and preserves the applicant's department separately", async () => {
  await adminCookie();
  const input={name:"Applicant",jobTitle:"موظف",department:"Media department",email:"applicant@example.com",entityId:"wamy"};
  const {entityId,...missing}=input;
  assert.equal((await registrationRoute.POST(request(missing))).status,400);
  await store.setJSON("entities",[{id:"hidden",name:"Hidden",hidden:true},{id:"deleted",name:"Deleted",hidden:false,deleted:true}]);
  for(const id of ["", "unknown", "hidden", "deleted"]) assert.equal((await registrationRoute.POST(request({...input,entityId:id}))).status,400);
  assert.equal(data.get("registration-requests-v1"),undefined);
  assert.equal((await registrationRoute.POST(request(input))).status,201);
  const row=(await registrationService.listRegistrations())[0];
  assert.equal(row.entityId,entityId);assert.equal(row.entityName,"الندوة العالمية");assert.equal(row.department,"Media department");
});
test("mail setup identifies the restricted Resend test sender", async () => {
  assert.equal(await registrationService.registrationMailMode(),"unconfigured");
  process.env.RESEND_API_KEY="test-key";process.env.REGISTRATION_MAIL_FROM="onboarding@resend.dev";
  assert.equal(await registrationService.registrationMailMode(),"test");
  process.env.REGISTRATION_MAIL_FROM="Notifications <onboarding@resend.dev>";
  assert.equal(await registrationService.registrationMailMode(),"test");
  process.env.REGISTRATION_MAIL_FROM="noreply@example.com";
  assert.equal(await registrationService.registrationMailMode(),"live");
});
test("approved registration provisions once, sends separate approval and activation messages, and forces password change", async () => {
  const admin=await adminCookie();const input={name:"Applicant",jobTitle:"مدير مشروع",department:"الندوة العالمية",entityId:"wamy",email:"applicant@example.com"};
  const sent=[];globalThis.fetch=async(url,options)=>{assert.equal(url,"https://api.resend.com/emails");sent.push({body:JSON.parse(options.body),key:options.headers["Idempotency-Key"]});return new Response(JSON.stringify({id:"sent"}),{status:200});};
  process.env.RESEND_API_KEY="test-key";process.env.REGISTRATION_MAIL_FROM="noreply@example.com";
  assert.equal((await registrationRoute.POST(request(input))).status,201);
  const row=(await(await registrationRoute.GET(request(null,admin,"GET"))).json()).requests[0];
  await store.setJSON("projects",[{id:"welcome-project",name:"مشروع الترحيب",description:""}]);
  const accountInput={name:input.name,email:input.email,position:"project_manager",entityId:"wamy",password:temporaryPassword,registrationRequestId:row.id,registrationProjectId:"welcome-project"};
  assert.equal((await users.POST(request(accountInput,admin))).status,400);
  assert.equal((await registrationRoute.PATCH(request({id:row.id,status:"approved"},admin,"PATCH"))).status,200);
  assert.ok(sent.some(item=>item.body.to[0]===input.email&&item.body.subject==="الموافقة على طلب تسجيلك"));
  assert.equal((await users.POST(request({...accountInput,email:"other-applicant@example.com"},admin))).status,400);
  assert.equal((await users.POST(request(accountInput,admin))).status,201);
  const first=await accounts.findAccount(input.email);assert.equal(first.registrationRequestId,row.id);
  assert.equal(first.mustChangePassword,true);assert.equal(first.active,true);
  const firstLogin=await signIn(input.email,input.email);assert.equal(firstLogin.status,200);
  const firstSession=await firstLogin.clone().json();assert.equal(firstSession.mustChangePassword,true);assert.equal(firstSession.canManageUsers,false);
  assert.ok([401,403].includes((await tasks.PATCH(request({id:seed.id,status:"completed"},cookie(firstLogin),"PATCH"))).status));
  const changed=await password.POST(request({currentPassword:input.email,newPassword:personalPassword},cookie(firstLogin)));assert.equal(changed.status,200);
  assert.equal((await signIn(input.email,input.email)).status,401);
  assert.equal((await signIn(input.email,personalPassword)).status,200);
  const activated=(await(await registrationRoute.GET(request(null,admin,"GET"))).json()).requests[0];assert.equal(activated.status,"activated");
  const welcome=sent.find(item=>item.body.to[0]===input.email&&item.body.subject.includes("تم تفعيل حسابك"));
  assert.ok(welcome.body.subject.includes("مشروع الترحيب"));assert.ok(welcome.body.text.includes(`كلمة المرور لأول دخول: نفس البريد الإلكتروني (${input.email})`));assert.ok(welcome.body.text.includes("تغيير كلمة المرور مباشرةً"));assert.ok(welcome.body.text.includes(origin));
  assert.ok(sent.every(item=>!item.body.text.includes(temporaryPassword)));
  const beforeReplay=sent.length;assert.equal((await users.POST(request(accountInput,admin))).status,201);
  assert.equal(sent.length,beforeReplay);assert.equal(await accounts.verifyPassword(personalPassword,(await accounts.findAccount(input.email)).passwordHash),true);
  assert.equal(new Set(sent.map(item=>item.key)).size,sent.length);
});
test("registration hold and rejection notify the applicant, and failed delivery can be retried", async () => {
  const admin=await adminCookie();const input={name:"Applicant",jobTitle:"موظف",department:"الإدارة",entityId:"wamy",email:"applicant@example.com"};
  await registrationRoute.POST(request(input));const row=(await registrationService.listRegistrations())[0];
  for(const status of ["on_hold","rejected"]){assert.equal((await registrationRoute.PATCH(request({id:row.id,status,note:"Review note"},admin,"PATCH"))).status,200);}
  const reviewed=(await registrationService.listRegistrations())[0];
  assert.equal(reviewed.status,"rejected");assert.equal(reviewed.notifications.filter(item=>item.to===input.email).length,2);
  assert.ok(reviewed.notifications.filter(item=>item.to===input.email).every(item=>item.text.includes("Review note")));
  await registrationRoute.PATCH(request({id:row.id,status:"rejected",note:"Review note"},admin,"PATCH"));
  assert.equal((await registrationService.listRegistrations())[0].notifications.length,reviewed.notifications.length);
  process.env.RESEND_API_KEY="test-key";process.env.REGISTRATION_MAIL_FROM="noreply@example.com";
  globalThis.fetch=async()=>new Response("failure",{status:503});
  await registrationService.flushRegistrationEmails();
  assert.equal((await registrationService.listRegistrations())[0].notifications[0].status,"failed");
  globalThis.fetch=async()=>new Response(JSON.stringify({id:"sent"}),{status:200});
  assert.equal((await registrationRoute.PUT(request(null,admin,"PUT"))).status,200);
  assert.ok((await registrationService.listRegistrations())[0].notifications.every(item=>item.status==="sent"));
  assert.equal((await users.POST(request({name:input.name,email:input.email,position:"employee",password:temporaryPassword,registrationRequestId:row.id},admin))).status,400);
});
test("registration activation recovers after account creation is interrupted", async () => {
  await adminCookie();const input={name:"Applicant",jobTitle:"مدير مشروع",department:"الإدارة",entityId:"wamy",email:"applicant@example.com"};
  await registrationService.submitRegistration(input);const row=(await registrationService.listRegistrations())[0];
  await registrationService.reviewRegistration({id:row.id,status:"approved",note:""},"admin@example.com");
  await accounts.createUser({name:input.name,email:input.email,position:"project_manager",managerEmail:null,additionalManagerEmail:null,entityId:null,password:temporaryPassword,registrationRequestId:row.id});
  assert.equal((await registrationService.listRegistrations())[0].status,"activated");
  assert.equal((await registrationService.listRegistrations())[0].notifications.filter(item=>item.subject.includes("تم تفعيل حسابك")).length,1);
});

test("Gmail notifications use HTTPS and MIME from the configured Google account", async () => {
  await adminCookie();process.env.REGISTRATION_MAIL_PROVIDER="gmail";
  assert.equal(await registrationService.registrationMailConfigured(),false);
  process.env.GMAIL_APP_PASSWORD="unused-app-password";
  assert.equal(await registrationService.registrationMailConfigured(),false);
  configureGmail();assert.equal(await registrationService.registrationMailMode(),"live");
  await registrationService.submitRegistration({name:"Applicant",jobTitle:"موظف",department:"الإدارة",entityId:"wamy",email:"applicant@example.com"});
  assert.ok(gmailSent.length>0);assert.equal(gmailSent[0].parsed.from.value[0].address,"hkudaish@gmail.com");assert.equal(gmailSent[0].parsed.replyTo.value[0].address,"hkudaish@gmail.com");
  assert.ok(gmailSent[0].parsed.subject.startsWith("[MProjDashboard]"));assert.equal(gmailSent[0].parsed.headers.get("x-mprojdashboard"),"application-mail");
});
test("Gmail API inbox is admin-only and replies to the original sender in the same thread", async () => {
  const admin=await adminCookie();
  assert.equal((await mailboxRoute.GET(request(null,"","GET"))).status,403);
  const missing=await(await mailboxRoute.GET(request(null,admin,"GET"))).json();assert.equal(missing.configured,false);
  configureGmail();
  const listed=await(await mailboxRoute.GET(request(null,admin,"GET"))).json();assert.equal(listed.messages[0].id,"abc123");assert.equal(listed.messages[0].unread,true);assert.equal(listed.nextPageToken,"page_2");
  assert.equal((await mailboxRoute.GET(new Request(origin+"/api/mailbox?id=41:7",{headers:{cookie:admin}}))).status,400);
  assert.equal((await mailboxRoute.GET(new Request(origin+"/api/mailbox?pageToken=invalid%20token",{headers:{cookie:admin}}))).status,400);
  const detail=await(await mailboxRoute.GET(new Request(origin+"/api/mailbox?id=abc123",{headers:{cookie:admin}}))).json();assert.equal(detail.message.text.trim(),"Original message text");assert.equal(detail.message.replyTo,"support@example.com");
  assert.equal((await mailboxRoute.GET(new Request(origin+"/api/mailbox?id=deadbeef",{headers:{cookie:admin}}))).status,503);
  assert.equal((await mailboxRoute.POST(request({id:"abc123",text:"Reply from app",to:"attacker@example.com"},admin))).status,400);
  assert.equal((await mailboxRoute.POST(request({id:"abc123",text:"Reply from app"},admin,"POST","https://foreign.example"))).status,403);
  assert.equal((await mailboxRoute.POST(request({id:"abc123",text:"Reply from app"},admin))).status,200);
  assert.equal(gmailSent[0].parsed.to.value[0].address,"support@example.com");assert.equal(gmailSent[0].parsed.from.value[0].address,"hkudaish@gmail.com");assert.equal(gmailSent[0].parsed.inReplyTo,"<original@example.com>");
  assert.equal(gmailSent[0].threadId,"thread1");assert.ok(gmailSent[0].parsed.references.includes("<original@example.com>"));
  assert.equal(gmailSent[0].parsed.subject,"Re: [MProjDashboard] Test message");
});

test("personal mail is excluded from lists and cannot be opened or replied to through the application", async () => {
  const admin=await adminCookie();configureGmail();const normalFetch=globalThis.fetch;const requested=[];
  globalThis.fetch=async (url,options)=>{
    const path=String(url);requested.push(path);
    if(path.includes("/messages?"))return Response.json({messages:[{id:"abc123"},{id:"abc456"},{id:"abc789"}]});
    if(path.includes("/messages/abc456"))return Response.json({id:"abc456",labelIds:["INBOX","UNREAD"],payload:{headers:[{name:"Subject",value:"Personal bank statement"}]}});
    if(path.includes("/messages/abc789"))return Response.json({id:"abc789",labelIds:["SENT"],payload:{headers:[{name:"Subject",value:"[MProjDashboard] Sent notification"}]}});
    return normalFetch(url,options);
  };
  const listed=await(await mailboxRoute.GET(request(null,admin,"GET"))).json();assert.deepEqual(listed.messages.map(item=>item.id),["abc123"]);assert.equal(listed.messages[0].preview,"Original message preview");
  for(const id of ["abc456","abc789"]){
    assert.equal((await mailboxRoute.GET(new Request(origin+"/api/mailbox?id="+id,{headers:{cookie:admin}}))).status,403);
    assert.equal((await mailboxRoute.POST(request({id,text:"Do not send"},admin))).status,403);
  }
  assert.equal(gmailSent.length,0);assert.equal(requested.some(path=>/abc(?:456|789).*format=raw/.test(path)),false);
});

test("Google authorization requires an admin, same origin, state and PKCE; tokens are encrypted", async () => {
  const admin=await adminCookie();
  assert.equal((await gmailConnect.POST(request(null,admin))).status,503);
  configureGmail();delete process.env.GOOGLE_REFRESH_TOKEN;
  assert.equal((await gmailConnect.POST(request(null))).status,403);
  assert.equal((await gmailConnect.POST(request(null,admin,"POST","https://foreign.example"))).status,403);
  const started=await gmailConnect.POST(request(null,admin));assert.equal(started.status,200);
  const url=new URL((await started.json()).url);assert.equal(url.origin,"https://accounts.google.com");
  assert.equal(url.searchParams.get("access_type"),"offline");assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("scope"),gmailApi.GMAIL_SCOPES.join(" "));
  const stateCookie=started.headers.get("set-cookie").split(";")[0];assert.ok(started.headers.get("set-cookie").includes("HttpOnly"));assert.ok(started.headers.get("set-cookie").includes("SameSite=Lax"));
  assert.equal((await gmailCallback.GET(new Request(origin+"/api/mailbox/callback?code=test&state=wrong",{headers:{cookie:stateCookie}}))).headers.get("location"),origin+"/?gmail=error");
  assert.equal(data.has("gmail-oauth-v1"),false);
  const response=await gmailCallback.GET(new Request(origin+"/api/mailbox/callback?code=test&state="+url.searchParams.get("state"),{headers:{cookie:stateCookie}}));
  assert.equal(response.headers.get("location"),origin+"/?gmail=connected");
  const encrypted=data.get("gmail-oauth-v1").value;assert.equal(encrypted.includes("new-refresh"),false);assert.equal(gmailApi.unseal(encrypted).refreshToken,"new-refresh");
  assert.equal(await gmailApi.gmailConfigured(),true);
});

test("the dedicated Gmail encryption key preserves mail access when the session key rotates", async () => {
  configureGmail();delete process.env.GOOGLE_REFRESH_TOKEN;
  process.env.GMAIL_TOKEN_SECRET="dedicated-gmail-encryption-key-with-32-characters";
  await gmailApi.saveRefreshToken("saved-refresh");
  process.env.ADMIN_SESSION_SECRET="replacement-session-secret-with-32-characters";
  assert.equal(await gmailApi.gmailConfigured(),true);
  process.env.GMAIL_TOKEN_SECRET="a-different-mail-encryption-key-with-32-characters";
  assert.equal(await gmailApi.gmailConfigured(),false);
});

test("Google callback rejects expired state, stale admin sessions, missing scopes and a different Gmail account", async () => {
  const admin=await adminCookie();configureGmail();delete process.env.GOOGLE_REFRESH_TOKEN;
  const account=await accounts.findAccount("admin@example.com");
  const makeRequest=(values={})=>new Request(origin+"/api/mailbox/callback?code=test&state=test-state",{headers:{cookie:"gmail_oauth_state="+gmailApi.seal({state:"test-state",verifier:"verifier",email:account.email,sessionVersion:account.sessionVersion,expiresAt:Date.now()+600000,...values})}});
  for (const values of [{expiresAt:1},{sessionVersion:account.sessionVersion+1}]) assert.equal((await gmailCallback.GET(makeRequest(values))).headers.get("location"),origin+"/?gmail=error");
  const normalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>String(url).endsWith("/token")?Response.json({access_token:"test-access",refresh_token:"new-refresh",scope:gmailApi.GMAIL_SCOPES[0]}):normalFetch(url,options);
  assert.equal((await gmailCallback.GET(makeRequest())).headers.get("location"),origin+"/?gmail=error");
  globalThis.fetch=async(url,options)=>String(url).endsWith("/profile")?Response.json({emailAddress:"different@gmail.com"}):normalFetch(url,options);
  assert.equal((await gmailCallback.GET(makeRequest())).headers.get("location"),origin+"/?gmail=error");
  assert.equal(data.has("gmail-oauth-v1"),false);
  // Tampered encrypted tokens fail closed and permit reconnecting.
  data.set("gmail-oauth-v1",{value:"invalid-ciphertext",etag:"test"});assert.equal(await gmailApi.gmailConfigured(),false);
  assert.ok(admin);
});

test("legacy accounts keep existing credentials, migrate once to salted hashes, and require first-login change", async () => {
  const listed = await accounts.listUsers(); assert.equal(listed.length, 3);
  assert.ok(listed.every((u) => u.role === "admin" && u.name === "مدير النظام" && u.mustChangePassword));
  const records = data.get("user-accounts-v1").value;
  assert.equal(new Set(records.map((u) => u.passwordHash)).size, 3);
  for (const user of records) assert.equal(await accounts.verifyPassword(oldPassword, user.passwordHash), true);
  assert.ok(!JSON.stringify(records).includes(oldPassword));
  const count = writes; await accounts.listUsers(); assert.equal(writes, count);
  assert.deepEqual(data.get("admin-emails").value, ["stored@example.com"]);
  const existingCookie = `task_admin_session=${auth.createAdminSessionToken("admin@example.com")}`;
  assert.equal((await auth.getUserSession(new Headers({ cookie: existingCookie }))).mustChangePassword, true);
  assert.equal(await auth.getAdminSession(new Headers({ cookie: existingCookie })), null);
});
test("temporary login is restricted even through direct task, product, user and compatibility API calls", async () => {
  const signed = await signIn("admin@example.com", oldPassword);
  const info = await signed.json(); assert.equal(info.authenticated, true); assert.equal(info.mustChangePassword, true); assert.equal(info.isAdmin, false); assert.equal(info.canManageUsers, false);
  const temporary = cookie(signed);
  assert.equal((await tasks.PATCH(request({ id: "task-1", status: "completed" }, temporary, "PATCH"))).status, 401);
  assert.equal((await tasks.POST(request(seed, temporary))).status, 401);
  assert.equal((await products.POST(request({ name: "منتج" }, temporary))).status, 401);
  assert.equal((await users.GET(request(null, temporary, "GET"))).status, 403);
  assert.equal((await legacy.POST(request({ email: "new@example.com" }, temporary))).status, 403);
});
test("changing password refreshes the session, invalidates the previous token, and removes the old credential", async () => {
  const signed = await signIn("admin@example.com", oldPassword); const previous = cookie(signed);
  const changed = await password.POST(request({ currentPassword: oldPassword, newPassword: personalPassword }, previous));
  assert.equal(changed.status, 200); const info = await changed.json(); assert.equal(info.canManageUsers, true); assert.equal(info.mustChangePassword, false);
  assert.equal(await auth.getUserSession(new Headers({ cookie: previous })), null);
  assert.ok(await auth.getSystemAdminSession(new Headers({ cookie: cookie(changed) })));
  assert.equal((await signIn("admin@example.com", oldPassword)).status, 401);
  assert.equal((await signIn("admin@example.com", personalPassword)).status, 200);
  assert.equal((await password.POST(request({ currentPassword: personalPassword, newPassword: personalPassword }, cookie(changed)))).status, 400);
});
test("creation requires a password and valid role, rejects duplicates, and never exposes hashes", async () => {
  const admin = await adminCookie();
  for (const payload of [{ email: "new@example.com", name: "جديد", role: "viewer" }, { email: "new@example.com", name: "جديد", role: "root", password: temporaryPassword }, { email: "new@example.com", name: "جديد", role: "viewer", password: "short" }])
    assert.equal((await users.POST(request(payload, admin))).status, 400);
  const created = await newUser(admin, "new@example.com", "viewer");
  assert.equal((await created.json()).user.mustChangePassword, true);
  assert.equal((await users.POST(request({ email: " NEW@example.com ", name: "duplicate", role: "viewer", password: temporaryPassword }, admin))).status, 400);
  const list = await (await users.GET(request(null, admin, "GET"))).json();
  assert.ok(list.users.every((u) => !Object.hasOwn(u, "passwordHash") && !Object.hasOwn(u, "password")));
  assert.ok(!JSON.stringify(list).includes(temporaryPassword));
});
test("permission matrix permits editor data changes and restricts account administration to system admins", async () => {
  const admin = await adminCookie();
  for (const role of ["viewer", "editor"]) {
    const email = `${role}@example.com`; await newUser(admin, email, role);
    const first = await signIn(email, temporaryPassword);
    const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(first)));
    const userCookie = cookie(changed);
    const summary = await (await session.GET(request(null, userCookie, "GET"))).json();
    assert.equal(summary.authenticated, true); assert.equal(summary.role, role); assert.equal(summary.canManageUsers, false);
    assert.equal((await users.GET(request(null, userCookie, "GET"))).status, 403);
    assert.equal((await projects.POST(request({ name: "مشروع ممنوع" }, userCookie))).status, 403);
    assert.equal((await products.PATCH(request({ id: "digital", name: "تعديل ممنوع" }, userCookie, "PATCH"))).status, 403);
    assert.equal((await users.POST(request({ email: "forbidden@example.com", name: "ممنوع", role: "admin", password: temporaryPassword }, userCookie))).status, 403);
    if (role === "editor") data.set("tasks", { etag: "task", value: [{ ...seed, createdByEmail: email }] });
    assert.equal((await tasks.PATCH(request({ id: "task-1", status: "review" }, userCookie, "PATCH"))).status, role === "editor" ? 200 : 403);
    assert.equal((await products.POST(request({ name: "منتج المحرر" }, userCookie))).status, role === "editor" ? 201 : 401);
  }
});
test("reset requests conceal account existence, do not change passwords, and deduplicate pending requests", async () => {
  const admin = await adminCookie(); await newUser(admin, "reset@example.com");
  const before = data.get("user-accounts-v1").value.find((u) => u.email === "reset@example.com").passwordHash;
  const known = await reset.POST(request({ email: "reset@example.com" }));
  const unknown = await reset.POST(request({ email: "missing@example.com" }));
  assert.equal(known.status, 200); assert.equal(unknown.status, 200); assert.deepEqual(await known.json(), await unknown.json());
  const after = data.get("user-accounts-v1").value.find((u) => u.email === "reset@example.com");
  assert.equal(after.passwordHash, before); assert.ok(after.resetRequestedAt);
  const count = writes; await reset.POST(request({ email: "reset@example.com" })); assert.equal(writes, count);
  assert.ok((await (await users.GET(request(null, admin, "GET"))).json()).users.find((u) => u.email === "reset@example.com").resetRequestedAt);
});
test("admin reset replaces the credential, revokes sessions, clears the request and requires another first-login change", async () => {
  const admin = await adminCookie(); await newUser(admin, "reset@example.com");
  const first = await signIn("reset@example.com", temporaryPassword);
  const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(first)));
  const existing = cookie(changed);
  await reset.POST(request({ email: "reset@example.com" }));
  const result = await users.PATCH(request({ email: "reset@example.com", temporaryPassword }, admin, "PATCH"));
  assert.equal(result.status, 200); const user = (await result.json()).user;
  assert.equal(user.mustChangePassword, true); assert.equal(user.resetRequestedAt, null);
  assert.equal(await auth.getUserSession(new Headers({ cookie: existing })), null);
  assert.equal((await signIn("reset@example.com", personalPassword)).status, 401);
  const relogin = await signIn("reset@example.com", temporaryPassword); assert.equal((await relogin.json()).mustChangePassword, true);
  assert.equal(await auth.getAdminSession(new Headers({ cookie: cookie(relogin) })), null);
  assert.equal((await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(relogin)))).status, 200);
});
test("role changes and disabling accounts take effect on existing sessions; self lockout is rejected", async () => {
  const admin = await adminCookie(); await newUser(admin, "editor@example.com"); await newUser(admin, "test-manager@example.com");
  const first = await signIn("editor@example.com", temporaryPassword);
  const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(first)));
  assert.equal((await users.PATCH(request({ email: "editor@example.com", position: "employee", managerEmail: "test-manager@example.com", entityId: "wamy" }, admin, "PATCH"))).status, 200);
  assert.equal(await auth.getUserSession(new Headers({ cookie: cookie(changed) })), null);
  assert.equal((await (await signIn("editor@example.com", personalPassword)).json()).isAdmin, false);
  assert.equal((await users.PATCH(request({ email: "editor@example.com", active: false }, admin, "PATCH"))).status, 200);
  assert.equal((await signIn("editor@example.com", personalPassword)).status, 401);
  assert.equal((await users.PATCH(request({ email: "admin@example.com", active: false }, admin, "PATCH"))).status, 400);
  assert.equal((await users.PATCH(request({ email: "admin@example.com", role: "viewer" }, admin, "PATCH"))).status, 400);
});
test("malformed input, foreign origins, forged and expired sessions are rejected", async () => {
  assert.equal((await login.POST(request("bad-json"))).status, 400);
  assert.equal((await login.POST(request({ email: "admin@example.com", password: oldPassword }, "", "POST", "https://foreign.example"))).status, 403);
  assert.equal((await reset.POST(request({ email: "admin@example.com" }, "", "POST", null))).status, 403);
  const admin = await adminCookie();
  assert.equal((await users.POST(request({ email: "x@example.com", name: "x", role: "viewer", password: temporaryPassword }, admin, "POST", "https://foreign.example"))).status, 403);
  assert.equal(await auth.getUserSession(new Headers({ cookie: admin + "tampered" })), null);
  const payload = Buffer.from(JSON.stringify({ email: "admin@example.com", sessionVersion: 1, expiresAt: 1 })).toString("base64url");
  const signature = require("node:crypto").createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(payload).digest("base64url");
  assert.equal(await auth.getUserSession(new Headers({ cookie: `task_admin_session=${payload}.${signature}` })), null);
});
test("repeated failed logins are temporarily locked and admin reset restores access", async () => {
  const admin = await adminCookie(); await newUser(admin, "locked@example.com");
  for (let i = 0; i < 5; i++) assert.equal((await signIn("locked@example.com", "wrong-password")).status, 401);
  assert.equal((await signIn("locked@example.com", temporaryPassword)).status, 401);
  assert.equal((await users.PATCH(request({ email: "locked@example.com", temporaryPassword }, admin, "PATCH"))).status, 200);
  assert.equal((await signIn("locked@example.com", temporaryPassword)).status, 200);
});
test("concurrent account creation does not overwrite another user's account", async () => {
  const admin = await adminCookie();
  await Promise.all([newUser(admin, "one@example.com"), newUser(admin, "two@example.com")]);
  const listed = await accounts.listUsers(); assert.ok(listed.some((u) => u.email === "one@example.com")); assert.ok(listed.some((u) => u.email === "two@example.com"));
});

const directory = await exports("app/api/users/directory/route.ts");
const entities = await exports("app/api/entities/route.ts");
async function positioned(admin, email, position, managerEmail, entityId = "wamy") {
  if (["department_manager", "project_manager"].includes(position) && managerEmail === "admin@example.com") { await ensureLeader(admin); managerEmail = "leader@example.com"; }
  const response = await users.POST(request({ email, name: email, position, managerEmail, entityId, password: temporaryPassword }, admin));
  assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).user;
}
async function personalCookie(email) {
  const signed = await signIn(email, temporaryPassword);
  const changed = await password.POST(request({ currentPassword: temporaryPassword, newPassword: personalPassword }, cookie(signed)));
  assert.equal(changed.status, 200); return cookie(changed);
}
async function tree(admin) {
  await positioned(admin, "department@example.com", "department_manager", "admin@example.com");
  await positioned(admin, "section@example.com", "section_head", "department@example.com");
  await positioned(admin, "staff@example.com", "employee", "section@example.com");
  await positioned(admin, "outside@example.com", "department_manager", "admin@example.com");
  await positioned(admin, "outsidesection@example.com", "section_head", "outside@example.com");
  await positioned(admin, "otherstaff@example.com", "employee", "outsidesection@example.com");
}
test("hierarchy requires valid positions, supervisors and entities and protects dependent users", async () => {
  const admin = await adminCookie(); await tree(admin);
  for (const fields of [
    { position: "employee", managerEmail: "admin@example.com", entityId: "wamy" },
    { position: "section_head", managerEmail: "admin@example.com", entityId: "wamy" },
    { position: "department_manager", managerEmail: "admin@example.com", entityId: null },
    { position: "system_admin", managerEmail: "admin@example.com", entityId: null },
    { position: "project_manager", managerEmail: "admin@example.com", entityId: "missing" },
  ]) assert.equal((await users.POST(request({ email: "bad@example.com", name: "Bad", password: temporaryPassword, ...fields }, admin))).status, 400);
  const before = data.get("user-accounts-v1").value.find((user) => user.email === "section@example.com").passwordHash;
  assert.equal((await users.PATCH(request({ email: "department@example.com", active: false }, admin, "PATCH"))).status, 400);
  assert.equal((await users.PATCH(request({ email: "department@example.com", position: "project_manager" }, admin, "PATCH"))).status, 400);
  assert.equal((await users.PATCH(request({ email: "staff@example.com", managerEmail: "staff@example.com" }, admin, "PATCH"))).status, 400);
  await positioned(admin, "seconddepartment@example.com", "department_manager", "admin@example.com");
  assert.equal((await users.PATCH(request({ email: "section@example.com", managerEmail: "seconddepartment@example.com" }, admin, "PATCH"))).status, 200);
  assert.equal(data.get("user-accounts-v1").value.find((user) => user.email === "section@example.com").passwordHash, before);
});
test("managers can assign to all descendants and employees can update only their assigned work", async () => {
  const admin = await adminCookie(); await tree(admin);
  const manager = await personalCookie("department@example.com");
  const staff = await personalCookie("staff@example.com");
  const scoped = await (await directory.GET(request(null, manager, "GET"))).json();
  assert.deepEqual(scoped.assignableUsers.map((user) => user.email).sort(), ["section@example.com", "staff@example.com"]);
  const detail = { id: "own-row", description: "Detail", status: "not_started", completionDate: "", ownerType: "wamy", assignee: "forged name", assigneeEmail: "staff@example.com" };
  const created = await tasks.POST(request({ ...seed, title: "Assigned task", assignee: "forged name", assigneeEmail: "staff@example.com", details: [detail] }, manager));
  assert.equal(created.status, 201, await created.clone().text()); const task = (await created.json()).task;
  assert.equal(task.assignee, "staff@example.com"); assert.equal(task.details[0].assignee, "staff@example.com");
  assert.equal((await tasks.PATCH(request({ id: task.id, assigneeEmail: "otherstaff@example.com", assignee: "otherstaff@example.com" }, manager, "PATCH"))).status, 403);
  assert.equal((await tasks.POST(request({ ...seed, title: "Outside task", assigneeEmail: "otherstaff@example.com" }, manager))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, status: "review" }, staff, "PATCH"))).status, 200);
  assert.equal((await tasks.PATCH(request({ id: task.id, title: "Changed title" }, staff, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [{ ...task.details[0], status: "completed", completionDate: "2026-10-08" }] }, staff, "PATCH"))).status, 200);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [{ ...task.details[0], description: "Forged" }] }, staff, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [] }, staff, "PATCH"))).status, 403);
  const anonymous = await (await tasks.GET()).json();
  assert.ok(anonymous.tasks.every((item) => !Object.hasOwn(item, "assigneeEmail") && !Object.hasOwn(item, "createdByEmail")));
  assert.ok(!JSON.stringify(scoped).includes("passwordHash"));
});
test("detail assignments preserve protected rows and scope follows administrative reparenting", async () => {
  const admin = await adminCookie(); await tree(admin);
  const manager = await personalCookie("department@example.com");
  const row = (id, email) => ({ id, description: id, status: "not_started", completionDate: "", ownerType: "wamy", assignee: "", assigneeEmail: email });
  const leader = await personalCookie("leader@example.com");
  const created = await tasks.POST(request({ ...seed, assigneeEmail: "section@example.com", details: [row("own", "staff@example.com"), row("protected", "otherstaff@example.com")] }, leader));
  assert.equal(created.status, 201); const task = (await created.json()).task;
  assert.equal((await tasks.PATCH(request({ id: task.id, details: task.details.map((detail) => detail.id === "protected" ? { ...detail, status: "completed" } : detail) }, manager, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: [task.details[0]] }, manager, "PATCH"))).status, 403);
  assert.equal((await tasks.PATCH(request({ id: task.id, details: task.details.map((detail) => detail.id === "own" ? { ...detail, status: "review" } : detail) }, manager, "PATCH"))).status, 200);
  await positioned(admin, "seconddepartment@example.com", "department_manager", "admin@example.com");
  assert.equal((await users.PATCH(request({ email: "section@example.com", managerEmail: "seconddepartment@example.com" }, admin, "PATCH"))).status, 200);
  assert.equal((await tasks.PATCH(request({ id: task.id, status: "completed" }, manager, "PATCH"))).status, 403);
  assert.deepEqual((await (await directory.GET(request(null, manager, "GET"))).json()).assignableUsers, []);
});
test("entity creation, rename, hiding and deletion retain linked records and validate project membership", async () => {
  const admin = await adminCookie();
  const added = await entities.POST(request({ name: "New Entity", description: "Original" }, admin)); assert.equal(added.status, 201);
  const entity = (await added.json()).entity;
  assert.equal((await entities.PATCH(request({ id: entity.id, name: "Renamed Entity" }, admin, "PATCH"))).status, 200);
  const project = await projects.POST(request({ name: "Entity Project", entityIds: [entity.id] }, admin)); assert.equal(project.status, 201);
  assert.equal((await entities.DELETE(request({ id: entity.id }, admin, "DELETE"))).status, 409);
  assert.equal((await entities.PATCH(request({ id: entity.id, hidden: true }, admin, "PATCH"))).status, 200);
  assert.ok(!(await (await entities.GET(request(null, "", "GET"))).json()).entities.some((item) => item.id === entity.id));
  assert.ok((await (await entities.GET(request(null, admin, "GET"))).json()).entities.some((item) => item.id === entity.id && item.hidden));
  assert.equal((await projects.POST(request({ name: "Invalid Project", entityIds: [entity.id] }, admin))).status, 400);
  const current = (await project.json()).project;
  assert.equal((await projects.PATCH(request({ id: current.id, name: "Renamed Project", entityIds: [entity.id] }, admin, "PATCH"))).status, 200);
  assert.equal((await users.POST(request({ email: "hidden@example.com", name: "Hidden", position: "project_manager", managerEmail: "admin@example.com", entityId: entity.id, password: temporaryPassword }, admin))).status, 400);
  const unused = await entities.POST(request({ name: "Unused" }, admin)); const unusedId = (await unused.json()).entity.id;
  assert.equal((await entities.DELETE(request({ id: unusedId }, admin, "DELETE"))).status, 200);
  assert.ok(!(await (await entities.GET(request(null, admin, "GET"))).json()).entities.some((item) => item.id === unusedId));
  assert.equal((await entities.POST(request({ name: "Forbidden" }))).status, 403);
});
test("existing salted credentials and active sessions survive the addition of hierarchy fields", async () => {
  const admin = await adminCookie(); const raw = data.get("user-accounts-v1").value;
  const previous = structuredClone(raw.find((user) => user.email === "admin@example.com"));
  for (const user of raw) { delete user.position; delete user.managerEmail; delete user.entityId; }
  data.set("user-accounts-v1", { etag: "legacy-no-hierarchy", value: raw });
  const active = await auth.getSystemAdminSession(new Headers({ cookie: admin })); assert.equal(active.position, "system_admin");
  const account = await accounts.findAccount("admin@example.com"); assert.equal(account.passwordHash, previous.passwordHash); assert.equal(account.sessionVersion, previous.sessionVersion);
  assert.equal((await signIn("admin@example.com", personalPassword)).status, 200);
});

test("updating the system director's display name preserves their active session and credential", async () => {
  const admin = await adminCookie(); const before = await accounts.findAccount("admin@example.com");
  assert.equal((await users.PATCH(request({ email: "admin@example.com", name: "Updated Director", position: "system_admin", managerEmail: null, entityId: null }, admin, "PATCH"))).status, 200);
  const after = await accounts.findAccount("admin@example.com"); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.sessionVersion, before.sessionVersion);
  assert.equal((await auth.getSystemAdminSession(new Headers({ cookie: admin }))).name, "Updated Director");
});

test("changing login email preserves assignments, reporting links and passwords, and revokes old sessions", async () => {
  const admin = await adminCookie(); await tree(admin);
  const managerCookie = await personalCookie("department@example.com");
  const before = await accounts.findAccount("department@example.com");
  const leader = await personalCookie("leader@example.com");
  const created = await tasks.POST(request({ ...seed, title: "History", assigneeEmail: "department@example.com", assignee: "" }, leader)); assert.equal(created.status, 201); const task = (await created.json()).task;
  const renamed = await users.PATCH(request({ email: "department@example.com", newEmail: "RENAMED@example.com", name: "Renamed Manager" }, admin, "PATCH")); assert.equal(renamed.status, 200);
  const after = await accounts.findAccount("department@example.com"); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.loginEmail, "renamed@example.com");
  assert.equal((await accounts.findAccount("section@example.com")).managerEmail, "department@example.com");
  assert.equal(await auth.getUserSession(new Headers({ cookie: managerCookie })), null);
  assert.equal((await signIn("department@example.com", personalPassword)).status, 401);
  const signed = await signIn("renamed@example.com", personalPassword); assert.equal(signed.status, 200); assert.equal((await signed.clone().json()).loginEmail, "renamed@example.com");
  assert.equal((await tasks.PATCH(request({ id: task.id, status: "review" }, cookie(signed), "PATCH"))).status, 200);
  assert.deepEqual((await (await directory.GET(request(null, cookie(signed), "GET"))).json()).assignableUsers.map(user=>user.email).sort(), ["section@example.com", "staff@example.com"]);
  assert.equal((await reset.POST(request({ email: "renamed@example.com" }))).status, 200); assert.ok((await accounts.findAccount("department@example.com")).resetRequestedAt);
  assert.equal((await users.PATCH(request({ email: "department@example.com", newEmail: "outside@example.com" }, admin, "PATCH"))).status, 400);
});
test("system director can change their login email without being locked out", async () => {
  const admin = await adminCookie();
  const changed = await users.PATCH(request({ email: "admin@example.com", newEmail: "director@example.com" }, admin, "PATCH")); assert.equal(changed.status, 200);
  assert.equal(await auth.getUserSession(new Headers({ cookie: admin })), null);
  assert.ok(await auth.getSystemAdminSession(new Headers({ cookie: cookie(changed) })));
  assert.equal((await signIn("director@example.com", personalPassword)).status, 200);
  assert.equal((await signIn("admin@example.com", personalPassword)).status, 401);
});
test("deleted accounts can be restored with the same identity, fresh credentials and preserved task history", async () => {
  const admin = await adminCookie(); await tree(admin); const staffCookie=await personalCookie("staff@example.com");
  const row={id:"historical-row",description:"Historical detail",status:"review",completionDate:"",ownerType:"wamy",assignee:"",assigneeEmail:"staff@example.com"};
  const leader=await personalCookie("leader@example.com");
  const created=await tasks.POST(request({...seed,assignee:"",assigneeEmail:"staff@example.com",details:[row]},leader));assert.equal(created.status,201);const task=(await created.json()).task;
  const storedBefore=structuredClone(data.get("tasks").value);
  assert.equal((await users.DELETE(request({email:"staff@example.com"},admin,"DELETE"))).status,200);
  assert.equal(await auth.getUserSession(new Headers({cookie:staffCookie})),null);
  assert.equal((await signIn("staff@example.com",personalPassword)).status,401);
  assert.ok(!(await accounts.listUsers()).some(user=>user.email==="staff@example.com"));
  assert.equal(data.get("user-accounts-v1").value.find(user=>user.email==="staff@example.com").passwordHash,"");
  assert.deepEqual(data.get("tasks").value,storedBefore);
  assert.equal((await tasks.PATCH(request({id:task.id,notes:"History remains editable"},admin,"PATCH"))).status,200);
  const countBeforeRestore=data.get("user-accounts-v1").value.length;
  const versionBeforeRestore=data.get("user-accounts-v1").value.find(user=>user.email==="staff@example.com").sessionVersion;
  const historyBeforeRestore=structuredClone(data.get("tasks").value);
  const restored=await users.POST(request({email:"staff@example.com",name:"Restored employee",position:"employee",managerEmail:"section@example.com",entityId:"wamy",password:temporaryPassword},admin));
  assert.equal(restored.status,201);
  assert.equal((await restored.json()).user.mustChangePassword,true);
  const account=await accounts.findAccount("staff@example.com");
  assert.equal(account.deleted,false);assert.equal(account.active,true);
  assert.equal(account.sessionVersion,versionBeforeRestore+1);
  assert.equal(account.name,"Restored employee");
  assert.equal(data.get("user-accounts-v1").value.length,countBeforeRestore);
  assert.deepEqual(data.get("tasks").value,historyBeforeRestore);
  assert.equal(await auth.getUserSession(new Headers({cookie:staffCookie})),null);
  assert.equal((await signIn("staff@example.com",personalPassword)).status,401);
  const temporaryLogin=await signIn("staff@example.com",temporaryPassword);
  assert.equal(temporaryLogin.status,200);assert.equal((await temporaryLogin.json()).mustChangePassword,true);
  assert.equal((await users.POST(request({email:"staff@example.com",name:"Duplicate",position:"employee",password:temporaryPassword},admin))).status,400);
});
test("restoration validates reporting links and permissions and cannot reuse a deleted login alias", async () => {
  const admin=await adminCookie();await tree(admin);const manager=await personalCookie("department@example.com");
  assert.equal((await users.DELETE(request({email:"staff@example.com"},admin,"DELETE"))).status,200);
  const payload={email:"staff@example.com",name:"Restored",position:"employee",managerEmail:"department@example.com",entityId:"wamy",password:temporaryPassword};
  assert.equal((await users.POST(request(payload,admin))).status,400);
  assert.equal(await accounts.findAccount("staff@example.com"),null);
  assert.equal((await users.POST(request({...payload,managerEmail:"section@example.com"},manager))).status,403);
  assert.equal(await accounts.findAccount("staff@example.com"),null);
  assert.equal((await users.POST(request({...payload,managerEmail:"section@example.com"},admin))).status,201);
  assert.equal((await users.PATCH(request({email:"staff@example.com",newEmail:"renamed@example.com"},admin,"PATCH"))).status,200);
  assert.equal((await users.DELETE(request({email:"staff@example.com"},admin,"DELETE"))).status,200);
  assert.equal((await users.POST(request({...payload,email:"renamed@example.com",managerEmail:"section@example.com"},admin))).status,400);
});
test("account deletion protects supervisors and self and is restricted to the system director", async () => {
  const admin=await adminCookie();await tree(admin);const manager=await personalCookie("department@example.com");
  assert.equal((await users.DELETE(request({email:"section@example.com"},admin,"DELETE"))).status,400);
  assert.equal((await users.DELETE(request({email:"admin@example.com"},admin,"DELETE"))).status,400);
  assert.equal((await users.DELETE(request({email:"staff@example.com"},manager,"DELETE"))).status,403);
  assert.equal((await users.DELETE(request({email:"staff@example.com"},admin,"DELETE","https://foreign.example"))).status,403);
  assert.equal((await users.DELETE(request("invalid-json",admin,"DELETE"))).status,400);
  assert.equal((await users.DELETE(request({email:"missing@example.com"},admin,"DELETE"))).status,400);
});

const hierarchy = await exports("lib/hierarchy.ts");
test("employees report only to section heads and the system administrator is excluded from the chain", async () => {
  const admin=await adminCookie();await tree(admin);
  await positioned(admin,"project@example.com","project_manager","admin@example.com");
  const listed=await accounts.listUsers();
  assert.ok(hierarchy.managerOptions(listed,"employee").every(user=>user.position==="section_head"));
  assert.deepEqual(hierarchy.supervisorChain(listed,"section@example.com").map(user=>user.position),["secretary_general","department_manager","section_head"]);
  for (const managerEmail of ["project@example.com", "department@example.com", "admin@example.com", "staff@example.com"])
    assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail},admin,"PATCH"))).status,400);
  assert.deepEqual(hierarchy.subordinateUsers(listed,"admin@example.com"),[]);
});
test("legacy employee/project links are repairable without granting project managers assignment scope", async () => {
  const admin=await adminCookie();await tree(admin);await positioned(admin,"project@example.com","project_manager","admin@example.com");
  const previousHash=(await accounts.findAccount("staff@example.com")).passwordHash;
  const rows=data.get("user-accounts-v1").value;rows.find(user=>user.email==="staff@example.com").managerEmail="project@example.com";
  data.set("user-accounts-v1",{etag:"legacy-project-link",value:rows});
  const manager=await personalCookie("project@example.com");
  assert.deepEqual((await(await directory.GET(request(null,manager,"GET"))).json()).assignableUsers,[]);
  assert.equal((await tasks.POST(request({...seed,assigneeEmail:"staff@example.com",assignee:""},manager))).status,403);
  await positioned(admin,"newdepartment@example.com","department_manager","admin@example.com");
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail:"section@example.com"},admin,"PATCH"))).status,200);
  assert.equal((await accounts.findAccount("staff@example.com")).passwordHash,previousHash);
});

test("legacy dual reporting stays repairable and grants no additional assignment scope", async () => {
  const admin=await adminCookie();await tree(admin);
  const before=await accounts.findAccount("staff@example.com");
  const rows=data.get("user-accounts-v1").value;
  rows.find(user=>user.email==="staff@example.com").additionalManagerEmail="outside@example.com";
  data.set("user-accounts-v1",{etag:"old-dual-reporting",value:rows});
  assert.ok(!hierarchy.subordinateUsers(await accounts.listUsers(),"outside@example.com").some(user=>user.email==="staff@example.com"));
  await positioned(admin,"newdepartment@example.com","department_manager","admin@example.com");
  assert.equal((await users.PATCH(request({email:"staff@example.com",additionalManagerEmail:null},admin,"PATCH"))).status,200);
  assert.equal((await accounts.findAccount("staff@example.com")).passwordHash,before.passwordHash);
});
test("new accounts require a single eligible supervisor and reject dual reporting", async () => {
  const admin=await adminCookie();await tree(admin);
  for (const changes of [
    {email:"staff@example.com",managerPosition:"both"},
    {email:"staff@example.com",additionalManagerEmail:"outside@example.com"},
    {email:"staff@example.com",managerPosition:"department_manager"},
    {email:"section@example.com",managerEmail:"leader@example.com"},
    {email:"admin@example.com",additionalManagerEmail:"outside@example.com"},
  ]) assert.equal((await users.PATCH(request(changes,admin,"PATCH"))).status,400);
  assert.equal((await users.POST(request({email:"newstaff@example.com",name:"Staff",position:"employee",managerEmail:"section@example.com",password:temporaryPassword},admin))).status,201);
});
test("task assignment lists exclude system directors and remain scoped to registered reporting relationships", async () => {
  const admin=await adminCookie();await tree(admin);
  await positioned(admin,"project@example.com","project_manager","admin@example.com");
  await positioned(admin,"otherleader@example.com","secretary_general",null,null);
  await positioned(admin,"otherdepartment@example.com","department_manager","otherleader@example.com");
  const rootDirectory=await(await directory.GET(request(null,admin,"GET"))).json();
  assert.deepEqual(rootDirectory.assignableUsers,[]);
  const leader=await personalCookie("leader@example.com");
  const leadershipDirectory=await(await directory.GET(request(null,leader,"GET"))).json();
  assert.ok(leadershipDirectory.assignableUsers.some(user=>user.email==="project@example.com"));
  assert.ok(leadershipDirectory.assignableUsers.some(user=>user.email==="staff@example.com"));
  assert.ok(!leadershipDirectory.assignableUsers.some(user=>user.email==="otherdepartment@example.com"));
  const department=await personalCookie("department@example.com");const section=await personalCookie("section@example.com");const project=await personalCookie("project@example.com");const employee=await personalCookie("staff@example.com");
  assert.deepEqual((await(await directory.GET(request(null,department,"GET"))).json()).assignableUsers.map(user=>user.email).sort(),["section@example.com","staff@example.com"]);
  assert.deepEqual((await(await directory.GET(request(null,section,"GET"))).json()).assignableUsers.map(user=>user.email),["staff@example.com"]);
  assert.deepEqual((await(await directory.GET(request(null,project,"GET"))).json()).assignableUsers,[]);
  assert.deepEqual((await(await directory.GET(request(null,employee,"GET"))).json()).assignableUsers,[]);
  assert.equal((await tasks.POST(request({...seed,assigneeEmail:"otherdepartment@example.com",assignee:""},admin))).status,403);
});
test("system directors cannot be selected as task or detail assignees even through direct API calls", async () => {
  const admin=await adminCookie();await tree(admin);
  const row={id:"root-row",description:"Forbidden root assignment",status:"not_started",completionDate:"",ownerType:"wamy",assignee:"",assigneeEmail:"admin@example.com"};
  for(const email of ["admin@example.com","other@example.com"])assert.equal((await tasks.POST(request({...seed,assigneeEmail:email,assignee:""},admin))).status,403);
  assert.equal((await tasks.POST(request({...seed,details:[row]},admin))).status,403);
  assert.equal((await products.POST(request({name:"Root assigned product",details:[row]},admin))).status,403);
  const leader=await personalCookie("leader@example.com");
  const created=await tasks.POST(request({...seed,assigneeEmail:"staff@example.com",assignee:""},leader));assert.equal(created.status,201);const task=(await created.json()).task;
  assert.equal((await tasks.PATCH(request({id:task.id,assigneeEmail:"admin@example.com",assignee:""},admin,"PATCH"))).status,403);
  assert.equal((await tasks.PATCH(request({id:task.id,details:[row]},admin,"PATCH"))).status,403);
  assert.equal(data.get("tasks").value.find(item=>item.id===task.id).assigneeEmail,"staff@example.com");
});
test("the task assignee is independent of the user's administrative supervisor", async () => {
  const admin=await adminCookie();await tree(admin);const section=await personalCookie("section@example.com");
  const before=await accounts.findAccount("staff@example.com");
  const created=await tasks.POST(request({...seed,assigneeEmail:"staff@example.com",assignee:""},section));assert.equal(created.status,201);const task=(await created.json()).task;
  assert.equal(task.assigneeEmail,"staff@example.com");assert.notEqual(task.assigneeEmail,before.managerEmail);
  assert.equal((await accounts.findAccount("staff@example.com")).managerEmail,before.managerEmail);
  assert.equal((await tasks.PATCH(request({id:task.id,assigneeEmail:"department@example.com",assignee:""},section,"PATCH"))).status,403);
});

test("leadership positions and administrative reporting are enforced in the API", async () => {
  const admin=await adminCookie();await ensureLeader(admin);
  await positioned(admin,"assistant@example.com","assistant_secretary_general","leader@example.com",null);
  await positioned(admin,"executive@example.com","executive_assistant","leader@example.com",null);
  await positioned(admin,"department@example.com","department_manager","assistant@example.com",null);
  await positioned(admin,"project@example.com","project_manager","executive@example.com",null);
  await positioned(admin,"section@example.com","section_head","department@example.com",null);
  await positioned(admin,"staff@example.com","employee","section@example.com",null);
  const listed=await accounts.listUsers();
  assert.deepEqual(hierarchy.managerOptions(listed,"department_manager").map(user=>user.position).sort(),["assistant_secretary_general","executive_assistant","secretary_general"].sort());
  assert.deepEqual(hierarchy.supervisorChain(listed,"section@example.com").map(user=>user.position),["secretary_general","assistant_secretary_general","department_manager","section_head"]);
  const assistant=await personalCookie("assistant@example.com");
  const created=await tasks.POST(request({...seed,assigneeEmail:"staff@example.com",assignee:""},assistant));assert.equal(created.status,201);
  assert.equal((await tasks.POST(request({...seed,assigneeEmail:"project@example.com",assignee:""},assistant))).status,403);
  for (const fields of [
    {position:"secretary_general",managerEmail:"admin@example.com"},
    {position:"assistant_secretary_general",managerEmail:"executive@example.com"},
    {position:"executive_assistant",managerEmail:"assistant@example.com"},
    {position:"section_head",managerEmail:"project@example.com"},
    {position:"employee",managerEmail:"department@example.com"},
  ]) assert.equal((await users.POST(request({email:"invalid@example.com",name:"Invalid",password:temporaryPassword,...fields},admin))).status,400);
});

test("administrative reporting is optional on creation and can be linked or cleared later", async () => {
  const admin=await adminCookie();
  for (const position of ["assistant_secretary_general", "executive_assistant", "department_manager", "project_manager", "section_head", "employee"]) {
    const response=await users.POST(request({email:`unlinked-${position}@example.com`,name:position,position,password:temporaryPassword,managerPosition:position === "employee" ? "section_head" : undefined},admin));
    assert.equal(response.status,201,await response.clone().text());
    assert.equal((await response.json()).user.managerEmail,null);
  }
  await tree(admin);
  const department=await personalCookie("department@example.com");
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail:null,managerPosition:"section_head"},admin,"PATCH"))).status,200);
  assert.ok(!(await(await directory.GET(request(null,department,"GET"))).json()).assignableUsers.some(user=>user.email==="staff@example.com"));
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail:"department@example.com"},admin,"PATCH"))).status,400);
  assert.equal((await users.PATCH(request({email:"staff@example.com",managerEmail:"section@example.com"},admin,"PATCH"))).status,200);
  assert.ok((await(await directory.GET(request(null,department,"GET"))).json()).assignableUsers.some(user=>user.email==="staff@example.com"));
});
