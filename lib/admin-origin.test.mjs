import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import vm from "node:vm";
import { createHmac, timingSafeEqual } from "node:crypto";
import ts from "typescript";

const environment = { env: {} };
const context = vm.createContext({ process: environment, URL });
const source = ts.transpileModule(readFileSync(new URL("./admin-auth.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const authModule = new vm.SourceTextModule(source, { context });
await authModule.link((specifier) => {
  const exports = specifier === "node:crypto" ? { createHmac, timingSafeEqual } : { getStore() { throw new Error("Origin checks must not read credentials or storage"); } };
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await authModule.evaluate();
const { hasSameOrigin } = authModule.namespace;
const mainUrl = "https://mproj-dashboard.netlify.app";
const branchUrl = "https://main--mproj-dashboard.netlify.app";
const request = (origin, url = branchUrl, headers = {}) => new Request(`${url}/api/auth/login`, {
  method: "POST", headers: { ...(origin ? { origin } : {}), ...headers },
});
beforeEach(() => { environment.env = {}; });

test("permits direct same-origin requests without hosting configuration", () => {
  assert.equal(hasSameOrigin(request(mainUrl, mainUrl)), true);
});
test("permits the trusted main site origin after Netlify rewrites the request URL", () => {
  environment.env.URL = mainUrl;
  assert.equal(hasSameOrigin(request(mainUrl)), true);
  assert.equal(hasSameOrigin(request(branchUrl)), true);
});
test("rejects foreign origins and spoofed forwarding headers", () => {
  environment.env.URL = mainUrl;
  assert.equal(hasSameOrigin(request("https://attacker.example", branchUrl, { "x-forwarded-host": "attacker.example" })), false);
  assert.equal(hasSameOrigin(request("https://mproj-dashboard.netlify.app.attacker.example")), false);
  assert.equal(hasSameOrigin(request("http://mproj-dashboard.netlify.app")), false);
});
test("rejects missing or malformed origins and fails closed on invalid configured URLs", () => {
  assert.equal(hasSameOrigin(request(null)), false);
  assert.equal(hasSameOrigin(request("null")), false);
  environment.env.URL = "invalid-url";
  assert.equal(hasSameOrigin(request(mainUrl)), false);
});