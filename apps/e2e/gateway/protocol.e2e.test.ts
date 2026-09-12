/**
 * Issue #10's layer 2: the real Gateway (`hue-grpc`) against a real fake
 * Bridge (`fake-hue`), both built from `malamoney/hue` at the revision
 * `proto/PINNED` names (`tools/e2e/hue.Dockerfile`).
 *
 * `gateway/adapter.test.ts`'s in-process fake Gateway covers nearly every
 * required case — this file's job is narrower and cannot be done there: prove
 * the vendored protos and the codec actually agree with what the real,
 * generated-from-the-same-protos service produces. The one exception is the
 * colour+temperature refusal, included here for completeness even though the
 * fake Bridge (ADR 0005) applies only `on`/`dimming` and would make a
 * wire-level assertion here misleading — that assertion stays in
 * `gen.test.ts`, which is the only place it can be made honestly.
 *
 * Runs against docker-compose.e2e.yml, which `scripts/e2e.sh up` brings up —
 * it is not started here, and every container name below is that file's
 * `name: sharpn-e2e` plus Compose's own `-<service>-1` suffix.
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { api, login, nextLightEvent, type Session } from "../support/http.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const FAKE_BRIDGE_CONTAINER = "sharpn-e2e-fake-bridge-1";
const GATEWAY_CONTAINER = "sharpn-e2e-gateway-1";
const CONSOLE_API_CONTAINER = "sharpn-e2e-console-api-1";

// fake-hue's own defaults (tools/fake_hue/bridge.py's DEFAULT_LIGHTS).
const DESK = "bbbbbbbb-0000-4000-8000-000000000001";
const SHELF = "bbbbbbbb-0000-4000-8000-000000000002";

function readE2eSecret(name: string): string {
  return readFileSync(join(REPO_ROOT, ".e2e", "secrets", name), "utf8").trim();
}

/** Polls a read until the Gateway stops answering it, and returns the body. */
async function untilRefused(session: Session, path: string): Promise<unknown> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await api(session, path);
    const body: unknown = await response.json();
    if (!response.ok) {
      return body;
    }
    await delay(500);
  }
  throw new Error(`${path} kept succeeding; the Bridge stop was never noticed`);
}

/** Polls a read until the Gateway answers it again. */
async function untilAnswering(session: Session, path: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await api(session, path);
    if (response.ok) {
      return;
    }
    await delay(500);
  }
  throw new Error(`${path} never started answering again after the Bridge restarted`);
}

let session: Session;

beforeAll(async () => {
  session = await login();
});

describe("the real Gateway, proving the vendored protos against it", () => {
  it("lists the fake Bridge's own lights", async () => {
    const response = await api(session, "/api/v1/lights");
    const lights = (await response.json()) as Array<{ id: string; name: string }>;

    expect(response.status).toBe(200);
    expect(lights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: DESK, name: "Desk" }),
        expect.objectContaining({ id: SHELF, name: "Shelf" }),
      ]),
    );
  });

  it("reads one Light by id", async () => {
    const response = await api(session, `/api/v1/lights/${DESK}`);
    const light = await response.json();

    expect(response.status).toBe(200);
    expect(light).toMatchObject({ id: DESK, name: "Desk" });
  });

  it("changes a Light through the real Bridge, and reads the change back", async () => {
    const before = (await (await api(session, `/api/v1/lights/${SHELF}`)).json()) as {
      on: boolean;
    };

    const update = await api(session, `/api/v1/lights/${SHELF}`, {
      method: "PATCH",
      body: JSON.stringify({ on: !before.on }),
    });
    const ack = await update.json();

    expect(update.status).toBe(200);
    expect(ack).toMatchObject({
      outcome: "success",
      updated: [{ rid: SHELF, rtype: "light" }],
      errors: [],
    });

    const after = (await (await api(session, `/api/v1/lights/${SHELF}`)).json()) as {
      on: boolean;
    };
    expect(after.on).toBe(!before.on);
  });

  it("refuses a colour and a colour temperature together, before either reaches the wire", async () => {
    const response = await api(session, `/api/v1/lights/${DESK}`, {
      method: "PATCH",
      body: JSON.stringify({
        colorXy: { x: 0.5, y: 0.25 },
        colorTemperatureMirek: 300,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: { code: "COLOR_AND_TEMPERATURE_BOTH_SET" } });
  });

  it("streams an Invalidation for a change made through the real Bridge", async () => {
    const stream = await api(session, "/api/v1/events");
    const reader = stream.body?.getReader();
    if (reader === undefined) {
      throw new Error("GET /api/v1/events answered with no body to read");
    }

    try {
      const seen = nextLightEvent(reader);

      const before = (await (await api(session, `/api/v1/lights/${SHELF}`)).json()) as {
        on: boolean;
      };
      await api(session, `/api/v1/lights/${SHELF}`, {
        method: "PATCH",
        body: JSON.stringify({ on: !before.on }),
      });

      const event = await Promise.race([
        seen,
        delay(10_000).then((): never => {
          throw new Error("no light.* event arrived within 10s");
        }),
      ]);
      expect(event).toMatchObject({ event: "light.changed", data: { id: SHELF } });
    } finally {
      await reader.cancel();
    }
  });

  it("reports the real Bridge as unreachable when it is, and recovers once it is back", async () => {
    execFileSync("docker", ["stop", FAKE_BRIDGE_CONTAINER]);
    try {
      const body = await untilRefused(session, `/api/v1/lights/${DESK}`);
      expect(body).toMatchObject({ error: { code: "BRIDGE_UNREACHABLE" } });
    } finally {
      execFileSync("docker", ["start", FAKE_BRIDGE_CONTAINER]);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const health = execFileSync("docker", [
          "inspect",
          "--format",
          "{{.State.Health.Status}}",
          FAKE_BRIDGE_CONTAINER,
        ])
          .toString()
          .trim();
        if (health === "healthy") {
          break;
        }
        if (attempt === 29) {
          throw new Error(`${FAKE_BRIDGE_CONTAINER} did not become healthy again`);
        }
        await delay(500);
      }
    }

    // The Gateway's own connection needs a read to notice the Bridge is back;
    // this is that read, and it is also this test cleaning up after itself
    // for the specs that assumed the fake Bridge stays up.
    await untilAnswering(session, `/api/v1/lights/${DESK}`);
  });

  it("never logs the Gateway Token or the Application Key", () => {
    const logs =
      execSync(`docker logs ${GATEWAY_CONTAINER} 2>&1`).toString() +
      execSync(`docker logs ${CONSOLE_API_CONTAINER} 2>&1`).toString() +
      execSync(`docker logs ${FAKE_BRIDGE_CONTAINER} 2>&1`).toString();

    expect(logs).not.toContain(readE2eSecret("gateway-token"));
    expect(logs).not.toContain(readE2eSecret("bridge-application-key"));
  });
});
