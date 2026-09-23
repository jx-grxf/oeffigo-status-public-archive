import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/db/package.json", import.meta.url),
);
const { createClient } = require("@libsql/client");
const { drizzle } = require("drizzle-orm/libsql");
const { migrate } = require("drizzle-orm/libsql/migrator");
const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});
try {
  await migrate(drizzle(client), {
    migrationsFolder: new URL("../packages/db/drizzle", import.meta.url)
      .pathname,
  });
  await client.execute(
    "CREATE TABLE IF NOT EXISTS oeffigo_check (checked_at TEXT PRIMARY KEY, payload TEXT NOT NULL, api_state TEXT NOT NULL)",
  );
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner || !owner.includes("@")) throw new Error("OWNER_EMAIL required");
  const limits = JSON.stringify({
    "page-components": 100,
    "status-pages": 1,
    "custom-domain": true,
    "status-subscribers": true,
    maintenance: true,
    "custom-theme": true,
    i18n: true,
    "uptime-history": true,
    "white-label": true,
    "audit-log": true,
    members: 1,
  });
  await client.execute({
    sql: "INSERT INTO workspace(id,slug,name,plan,limits) VALUES(1,'oeffigo','ÖffiGo','team',?) ON CONFLICT(id) DO UPDATE SET limits=excluded.limits",
    args: [limits],
  });
  await client.execute({
    sql: "INSERT INTO user(id,name,email) VALUES(1,'Status Owner',?) ON CONFLICT(id) DO NOTHING",
    args: [owner],
  });
  await client.execute(
    "INSERT INTO users_to_workspaces(user_id,workspace_id,role) VALUES(1,1,'owner') ON CONFLICT DO NOTHING",
  );
  const config = JSON.stringify({
    value: "manual",
    type: "manual",
    uptime: false,
    theme: "oeffigo",
    days: 30,
  });
  await client.execute({
    sql: "INSERT INTO page(id,workspace_id,title,description,icon,slug,custom_domain,published,force_theme,default_locale,locales,legacy_page,configuration,homepage_url,contact_url) VALUES(1,1,'ÖffiGo','Betriebsstatus, Meldungen und Wartungen.','/brand/mark.png','oeffigo','status.oeffigo.app',1,'dark','de','[\"de\",\"en\"]',0,?,'https://oeffigo.app','mailto:contact@oeffigo.app') ON CONFLICT(id) DO NOTHING",
    args: [config],
  });
  await client.execute("UPDATE page SET force_theme='dark' WHERE id=1");
  const names = [
    "Abfahrten",
    "Routenplanung",
    "Karte",
    "Verkehrsmeldungen",
    "Live-Prognosen",
    "Pünktlichkeitsdaten",
    "Website",
  ];
  for (let i = 0; i < names.length; i++)
    await client.execute({
      sql: "INSERT INTO page_component(id,workspace_id,page_id,type,name,\"order\") VALUES(?,1,1,'static',?,?) ON CONFLICT(id) DO NOTHING",
      args: [i + 1, names[i], i],
    });
  console.log("ÖffiGo schema and seven components ready");
} finally {
  client.close();
}
