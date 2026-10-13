/**
 * Disposable database provisioning for integration tests.
 *
 * Tests must never touch a user's real databases. A suite that needs MySQL or PostgreSQL asks for a
 * throwaway database, which is created with a unique name on the server named by an *admin URL* in the
 * environment and dropped afterwards:
 *
 *   TEST_MYSQL_URL=mysql://user:password@localhost:3306        (needs CREATE/DROP DATABASE)
 *   TEST_PG_URL=postgres://user:password@localhost:5432/postgres
 *
 * When the variable is not set, `provisionTestDb` returns null and the suite should be skipped.
 */
import { SQL } from "bun";
import { randomBytes } from "crypto";

export type TestEngine = "mysql" | "postgres";

export interface TestDb {
  engine: TestEngine;
  /** Unique throwaway database name (always matches /^bunrad_test_[a-f0-9]{12}$/). */
  name: string;
  /** Connection config accepted by the studio servers (host/port/user/password/database). */
  config: { host: string; port: number; user: string; password?: string; database: string; schema?: string };
  drop(): Promise<void>;
}

const NAME_RE = /^bunrad_test_[a-f0-9]{12}$/;

function envUrl(engine: TestEngine): string | undefined {
  const v = engine === "mysql" ? process.env.TEST_MYSQL_URL : process.env.TEST_PG_URL;
  return v && v.trim() ? v.trim() : undefined;
}

export function testDbAvailable(engine: TestEngine): boolean {
  return envUrl(engine) !== undefined;
}

export async function provisionTestDb(engine: TestEngine): Promise<TestDb | null> {
  const raw = envUrl(engine);
  if (!raw) return null;
  const u = new URL(raw.replace(/^mysql:\/\//i, "http://").replace(/^postgres(ql)?:\/\//i, "http://"));
  const host = u.hostname || "localhost";
  const port = Number(u.port) || (engine === "mysql" ? 3306 : 5432);
  const user = decodeURIComponent(u.username || "root");
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  const adminDb = engine === "mysql" ? undefined : decodeURIComponent(u.pathname.slice(1)) || "postgres";

  const admin = new SQL({
    adapter: engine === "mysql" ? "mysql" : "postgres",
    hostname: host,
    port,
    username: user,
    password,
    database: adminDb,
    max: 1,
    allowPublicKeyRetrieval: engine === "mysql" ? true : undefined,
  } as any);

  const name = `bunrad_test_${randomBytes(6).toString("hex")}`;
  if (!NAME_RE.test(name)) throw new Error("unsafe generated test database name");
  const quoted = engine === "mysql" ? `\`${name}\`` : `"${name}"`;
  await admin.unsafe(`CREATE DATABASE ${quoted}`);

  return {
    engine,
    name,
    config: { host, port, user, password, database: name, ...(engine === "postgres" ? { schema: "public" } : {}) },
    async drop() {
      try {
        if (engine === "postgres") {
          await admin.unsafe(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
        } else {
          await admin.unsafe(`DROP DATABASE IF EXISTS ${quoted}`);
        }
      } finally {
        await admin.close();
      }
    },
  };
}
