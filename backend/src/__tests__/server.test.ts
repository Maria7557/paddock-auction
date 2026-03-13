import type { FastifyInstance } from "fastify";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../server";

let server: FastifyInstance;

beforeAll(async () => {
  const env = process.env as Record<string, string | undefined>;

  env.JWT_SECRET = "test-secret-32-chars-long-enough!!";
  env.NODE_ENV = "test";
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await supertest(server.server).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns ISO timestamp", async () => {
    const res = await supertest(server.server).get("/api/health");
    const ts = new Date(res.body.timestamp);

    expect(ts).toBeInstanceOf(Date);
    expect(Number.isNaN(ts.getTime())).toBe(false);
  });

  it("timestamp is recent (within 5 seconds)", async () => {
    const before = Date.now();
    const res = await supertest(server.server).get("/api/health");
    const after = Date.now();
    const ts = new Date(res.body.timestamp).getTime();

    expect(ts).toBeGreaterThanOrEqual(before - 100);
    expect(ts).toBeLessThanOrEqual(after + 100);
  });
});

describe("CORS headers", () => {
  it("returns Access-Control-Allow-Origin header", async () => {
    const res = await supertest(server.server)
      .get("/api/health")
      .set("Origin", "http://localhost:3000");

    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});

describe("unknown routes", () => {
  it("returns 404 for unknown route", async () => {
    const res = await supertest(server.server).get("/api/does-not-exist");

    expect(res.status).toBe(404);
  });

  it("returns 404 for route without /api prefix", async () => {
    const res = await supertest(server.server).get("/health");

    expect(res.status).toBe(404);
  });
});

describe("buildServer", () => {
  it("returns a FastifyInstance", async () => {
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
    expect(typeof server.close).toBe("function");
    expect(typeof server.register).toBe("function");
  });

  it("can build multiple independent instances", async () => {
    const server2 = await buildServer();

    await server2.ready();

    expect(server2).not.toBe(server);

    await server2.close();
  });
});
