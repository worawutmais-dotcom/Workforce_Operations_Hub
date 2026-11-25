import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const requireToken = (source, token, file) => {
  if (!source.includes(token)) throw new Error(`${file}: missing ${token}`);
};

const app = read("admin_codex/src/app.js");
const template = read("admin_codex/src/index.template.html");
const edge = read("supabase/functions/bvn-api/index.ts");
const mirror = read("supabase/functions/swift-handler/index.ts");

for (const token of ["REALTIME_TOPIC", "startRealtime", "stopRealtime", "queueRealtimeRefresh", "window.supabase?.createClient", "adminRealtimeBroadcast"]) requireToken(app, token, "app.js");
requireToken(template, "@supabase/supabase-js@2.91.0", "index.template.html");
for (const token of ["REALTIME_TOPIC", "REALTIME_MUTATIONS", "realtime/v1/api/broadcast", "payload: { v: 1 }", "response.clone().json()", "adminRealtimeBroadcast: true"]) requireToken(edge, token, "bvn-api");
if (edge !== mirror) throw new Error("bvn-api and swift-handler must remain identical");
console.log("Realtime contract OK");
