import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readConfig(ctx) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ctx.configPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function safeValue(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[function]";
  if (depth > 8) return "[max depth]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => safeValue(item, seen, depth + 1));
  const result = {};
  for (const key of Object.keys(value).slice(0, 200)) {
    try { result[key] = safeValue(value[key], seen, depth + 1); } catch { result[key] = "[unreadable]"; }
  }
  return result;
}

function extractCode(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const direct = String(value.code || value.authorizationCode || value.authorization_code || value.openCode || value.authCode || value.auth_code ||
    value.accessToken || value.token || value.openAuthCode || "").trim();
  if (direct) return direct;
  for (const key of ["result", "data", "value"]) {
    const nested = extractCode(value[key]);
    if (nested) return nested;
  }
  return "";
}

function getResultCode(value) {
  if (!value || typeof value !== "object") return 0;
  const resultCode = Number(value.errCode ?? value.errorCode ?? value.resultCode ?? value.result?.errCode ?? value.result?.errorCode ?? 0);
  return Number.isFinite(resultCode) ? resultCode : 0;
}

// QQ 9.9.x exposes the qq.login authorization value as the `result` of
// loginWithAppId, rather than under a field named `code`. Restrict this
// interpretation to that method and a successful errCode so arbitrary data
// from the other NodeMiscService methods is never presented as a code.
function extractOperationCode(operation, value) {
  if (operation === "loginWithAppId") {
    if (getResultCode(value) !== 0) return "";
    return extractCode(value?.result) || extractCode(value);
  }
  return extractCode(value);
}

function extractOpenId(value) {
  if (!value || typeof value !== "object") return "";
  return String(value.openId || value.openID || value.openid || "").trim();
}

function getMiscService(ctx) {
  return ctx?.core?.context?.session?.getNodeMiscService?.();
}

function inspectService(value) {
  if (!value) return { available: false, methods: [] };
  const names = new Set();
  try {
    for (const key of Object.keys(value)) names.add(key);
  } catch {}
  try {
    let current = value;
    let depth = 0;
    while (current && current !== Object.prototype && depth++ < 4) {
      for (const key of Object.getOwnPropertyNames(current)) names.add(key);
      current = Object.getPrototypeOf(current);
    }
  } catch {}
  const methods = [...names].filter((name) => {
    try { return typeof value[name] === "function"; } catch { return false; }
  }).sort();
  return { available: true, methods };
}

function getLoginService(ctx) {
  const candidates = [
    ["session.getLoginService", () => ctx?.core?.context?.session?.getLoginService?.()],
    ["core.context.wrapper.NodeIKernelLoginService.get", () => ctx?.core?.context?.wrapper?.NodeIKernelLoginService?.get?.()],
    ["core.wrapper.NodeIKernelLoginService.get", () => ctx?.core?.wrapper?.NodeIKernelLoginService?.get?.()],
    ["context.session.getLoginService", () => ctx?.context?.session?.getLoginService?.()],
    ["context.wrapper.NodeIKernelLoginService.get", () => ctx?.context?.wrapper?.NodeIKernelLoginService?.get?.()],
  ];
  for (const [path, resolve] of candidates) {
    try {
      const service = resolve();
      if (service) return { service, path };
    } catch {}
  }
  return { service: undefined, path: undefined };
}

function buildOfflineSessionArg(ctx, service) {
  const core = ctx?.core;
  const context = core?.context;
  const selfInfo = core?.selfInfo || {};
  const basicInfo = context?.basicInfoWrapper;
  const platform = process.platform === "darwin" ? 4 : process.platform === "linux" ? 5 : 3;
  const read = (resolve, fallback = "") => {
    try {
      const value = resolve();
      return value === undefined || value === null ? fallback : value;
    } catch {
      return fallback;
    }
  };
  const accountPath = String(read(() => core.dataPath, ""));
  const clientVer = String(read(() => basicInfo?.getFullQQVersion?.(), ""));
  const appid = String(read(() => basicInfo?.QQVersionAppid, ""));
  const guid = String(read(() => service?.getMachineGuid?.(), ""));
  const uin = String(selfInfo.uin || selfInfo.user_id || selfInfo.qq || "");
  const uid = String(selfInfo.uid || selfInfo.userUid || "");
  const platVer = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  return {
    selfUin: uin,
    selfUid: uid,
    desktopPathConfig: { account_path: accountPath },
    clientVer,
    a2: "",
    d2: "",
    d2Key: "",
    machineId: "",
    platform,
    platVer,
    appid,
    rdeliveryConfig: {
      appKey: "",
      systemId: 0,
      appId: "",
      logicEnvironment: "",
      platform,
      language: "",
      sdkVersion: "",
      userId: "",
      appVersion: "",
      osVersion: "",
      bundleId: "",
      serverUrl: "",
      fixedAfterHitKeys: [""]
    },
    defaultFileDownloadPath: path.join(accountPath, "NapCat", "temp"),
    deviceInfo: {
      guid,
      buildVer: clientVer,
      localId: 2052,
      devName: os.hostname(),
      devType: platVer,
      vendorName: "",
      osVer: platVer,
      vendorOsName: platVer,
      setMute: false,
      vendorType: 0
    },
    deviceConfig: '{"appearance":{"isSplitViewMode":true},"msg":{}}'
  };
}

function callLogout(service, ctx) {
  for (const method of ["offline", "logout", "logOut", "signOut"]) {
    try {
      if (typeof service?.[method] === "function") return { method, promise: service[method]() };
    } catch (error) {
      return { method, error };
    }
  }
  // NapCat 4.18.x does not expose LoginService.offline() from every QQ
  // wrapper build, while the underlying wrapper session still provides the
  // native account-session teardown methods.
  const session = ctx?.core?.context?.session;
  const sessionArg = buildOfflineSessionArg(ctx, service);
  for (const method of ["offLine", "offLineSync"]) {
    try {
      if (typeof session?.[method] === "function") return { method: `WrapperSession.${method}`, promise: session[method](sessionArg) };
    } catch (error) {
      return { method: `WrapperSession.${method}`, error };
    }
  }
  return undefined;
}

export async function plugin_init(ctx) {
  const config = readConfig(ctx);
  const configuredToken = String(config.token || "").trim();
  const checkToken = (req, res) => {
    if (!configuredToken) return true;
    const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
    if (authorization === `Bearer ${configuredToken}`) return true;
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  };

  ctx.router.getNoAuth("/status", async (req, res) => {
    if (!checkToken(req, res)) return;
    const service = getMiscService(ctx);
    const login = getLoginService(ctx);
    const loginService = login.service;
    const inspected = inspectService(loginService);
    const sessionInspected = inspectService(ctx?.core?.context?.session);
    res.json({
      ok: true,
      ready: Boolean(service),
      logoutAvailable: ["offline", "logout", "logOut", "signOut"].some((name) => inspected.methods.includes(name)) ||
        ["offLine", "offLineSync"].some((name) => sessionInspected.methods.includes(name)),
      logoutServicePath: login.path,
      logoutMethods: inspected.methods.filter((name) => ["offline", "logout", "logOut", "signOut"].includes(name)),
      logoutSessionMethods: sessionInspected.methods.filter((name) => ["offLine", "offLineSync"].includes(name)),
      methods: service ? ["getOpenAuth", "getOpenCodeWithAppId", "loginWithAppId", "checkSessionForMiniApp", "loginWXMiniApp", "getUserInfoWithAppId"].filter((name) => typeof service[name] === "function") : []
    });
  });

  ctx.router.postNoAuth("/miniapp", async (req, res) => {
    if (!checkToken(req, res)) return;
    const appId = String(req.body?.appId || "").trim();
    if (!/^\d{6,20}$/.test(appId)) {
      res.status(400).json({ ok: false, error: "appId must contain 6 to 20 digits" });
      return;
    }
    const service = getMiscService(ctx);
    if (!service) {
      res.status(503).json({ ok: false, error: "QQ NodeMiscService is not ready" });
      return;
    }
    const methods = {};
    if (typeof service.getOpenCodeWithAppId === "function") methods.getOpenCodeWithAppId = () => service.getOpenCodeWithAppId(appId);
    if (typeof service.getOpenAuth === "function") methods.getOpenAuth = (interactive) => service.getOpenAuth(interactive, appId);
    if (typeof service.loginWithAppId === "function") methods.loginWithAppId = () => service.loginWithAppId(appId);
    if (typeof service.loginWXMiniApp === "function") methods.loginWXMiniApp = () => service.loginWXMiniApp(appId);
    if (typeof service.checkSessionForMiniApp === "function") methods.checkSessionForMiniApp = () => service.checkSessionForMiniApp(appId);
    if (typeof service.getUserInfoWithAppId === "function") methods.getUserInfoWithAppId = () => service.getUserInfoWithAppId(appId);
    if (!Object.keys(methods).length) {
      res.status(503).json({ ok: false, error: "QQ NodeMiscService OpenAuth method is unavailable" });
      return;
    }
    const requestedOperation = String(req.body?.operation || "auto");
    const candidates = requestedOperation === "auto"
      ? ["checkSessionForMiniApp", "loginWithAppId", "getOpenCodeWithAppId", "getOpenAuth"].filter((name) => methods[name])
      : [requestedOperation].filter((name) => methods[name]);
    if (!candidates.length) {
      res.status(400).json({ ok: false, error: `Unsupported OpenAuth operation: ${requestedOperation}`, methods: Object.keys(methods) });
      return;
    }
    let operation = candidates[0];
    let value;
    const attempts = [];
    for (const candidate of candidates) {
      operation = candidate;
      try {
        value = await methods[candidate](req.body?.interactive !== false);
        const safe = safeValue(value);
        attempts.push({ operation: candidate, result: safe });
        if (extractOperationCode(candidate, value)) break;
      } catch (error) {
        attempts.push({ operation: candidate, error: error?.message || String(error) });
      }
    }
    const code = extractOperationCode(operation, value);
    const openId = extractOpenId(value);
    res.json({
      ok: true,
      appId,
      operation,
      method: code ? operation : undefined,
      code: code || undefined,
      openId: openId || undefined,
      result: safeValue(value),
      attempts,
      error: code ? undefined : "QQNT OpenAuth methods returned no authorization code"
    });
  });

  // Prefer the login service when it is exported. NapCat 4.18.x builds may
  // omit that service method while the native wrapper session still exposes
  // offLine/offLineSync; callLogout() handles both paths.
  ctx.router.postNoAuth("/logout", async (req, res) => {
    if (!checkToken(req, res)) return;
    const login = getLoginService(ctx);
    const service = login.service;
    const invocation = callLogout(service, ctx);
    if (!invocation) {
      const inspected = inspectService(service);
      res.status(503).json({
        ok: false,
        error: "NapCat native logout methods are unavailable",
        servicePath: login.path,
        methods: inspected.methods
      });
      return;
    }
    try {
      if (invocation.error) throw invocation.error;
      const result = await invocation.promise;
      const method = invocation.method.includes(".") ? invocation.method : `NodeIKernelLoginService.${invocation.method}`;
      res.json({ ok: true, loggedOut: true, method, result: safeValue(result) });
    } catch (error) {
      res.status(502).json({ ok: false, error: error?.message || String(error) });
    }
  });

  ctx.logger.info("QQ mini-app OpenAuth plugin loaded");
}