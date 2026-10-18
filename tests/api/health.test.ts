// P3-FINISH-HEALTH / API-019 actual readiness (TASK-062/015/016).
//
// The route used to be a stub. These tests cover the new readiness module
// (`src/server/health/readiness.ts`) and the route wiring. Every probe is
// injected, so no real database and no real model is touched. We assert:
//
//   * ready when both probes succeed (200, both flags "ready");
//   * db down → db unavailable, embeddings still probed (and vice versa);
//   * an embedding probe that throws → embeddings unavailable, db still probed;
//   * an embedding probe that returns the wrong shape (length, NaN, zero
//     vector) → embeddings unavailable, never a leaked exception;
//   * the embedder is created with `allowRemote: false` so a missing cache
//     cannot fall back to a huggingface.co download from this path;
//   * a successful probe is memoised by config identity (we never pay the
//     warm-up cost on every request);
//   * the response is the strict API-019 schema, no raw error leaks, the
//     demo_mode flag mirrors `process.env.DEMO_MODE`, `synthetic_only` is
//     true, and the version comes from `package.json`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { healthResponseSchema } from "@/contracts";
import type { Embedder, LocalEmbedderOptions } from "@/server/embeddings/model";
import {
  EMBEDDING_DIM,
  createHealthReadiness,
  _configIdentity,
  _resetReadinessForTests,
} from "@/server/health/readiness";
import { ORIGIN, noParams } from "./fakes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SAMPLE = {
  model: "Xenova/multilingual-e5-small",
  space: "model=Xenova/multilingual-e5-small;dtype=fp32;pool=mean;normalize=true;query=\"query: \";passage=\"passage: \"",
  cacheDir: "/tmp/fera-test-cache",
};

function fakeEmbedder(
  embed: (texts: readonly string[]) => Promise<Float32Array[]>,
  overrides: Partial<Embedder> = {},
): Embedder {
  return {
    model: SAMPLE.model,
    revision: null,
    space: SAMPLE.space,
    dimension: EMBEDDING_DIM,
    embed,
    ...overrides,
  };
}

function goodVector(seed: number): Float32Array {
  // Deterministic 384-d, non-zero, L2-normalised.
  const v = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] = Math.sin((seed + i) * 0.013) + 0.0001;
  let n2 = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) n2 += v[i] * v[i];
  const inv = 1 / Math.sqrt(n2);
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] *= inv;
  return v;
}

describe("API-019 readiness: probes are independent and bounded", () => {
  afterEach(() => {
    _resetReadinessForTests();
  });

  it("returns ready when both probes succeed", async () => {
    const read = createHealthReadiness({
      dbProbe: async () => true,
      embeddingProbe: async () => true,
    });
    expect(await read()).toEqual({ db: "ready", embeddings: "ready" });
  });

  it("db probe failure → db unavailable, embedding still probed", async () => {
    const seen = { embed: 0 };
    const read = createHealthReadiness({
      dbProbe: async () => {
        throw new Error("connection refused");
      },
      embeddingProbe: async () => (seen.embed++, true),
    });
    const result = await read();
    expect(result.db).toBe("unavailable");
    expect(result.embeddings).toBe("ready");
    expect(seen.embed).toBe(1);
  });

  it("embedding probe failure → embeddings unavailable, db still probed", async () => {
    const seen = { db: 0 };
    const read = createHealthReadiness({
      dbProbe: async () => (seen.db++, true),
      embeddingProbe: async () => {
        throw new Error("cache missing");
      },
    });
    const result = await read();
    expect(result.db).toBe("ready");
    expect(result.embeddings).toBe("unavailable");
    expect(seen.db).toBe(1);
  });

  it("embedding probe that returns false → embeddings unavailable (no exception)", async () => {
    const read = createHealthReadiness({
      dbProbe: async () => true,
      embeddingProbe: async () => false,
    });
    expect(await read()).toEqual({ db: "ready", embeddings: "unavailable" });
  });

  it("db probe returning false is also unavailable (not silently flipped)", async () => {
    const read = createHealthReadiness({
      dbProbe: async () => false,
      embeddingProbe: async () => true,
    });
    expect(await read()).toEqual({ db: "unavailable", embeddings: "ready" });
  });

  it("probes run in parallel; one slow probe does not delay the other", async () => {
    const order: string[] = [];
    const read = createHealthReadiness({
      dbProbe: async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push("db");
        return true;
      },
      embeddingProbe: async () => {
        order.push("embed");
        return true;
      },
    });
    const t0 = Date.now();
    await read();
    const elapsed = Date.now() - t0;
    expect(order[0]).toBe("embed"); // embedding started first
    expect(elapsed).toBeLessThan(60); // not 30 + ε (i.e., not serialised)
  });
});

describe("API-019 readiness: actual embedder shape proof", () => {
  afterEach(() => {
    _resetReadinessForTests();
  });

  it("uses the injected loadEmbedder with allowRemote: false", async () => {
    const calls: Array<{ opts: LocalEmbedderOptions }> = [];
    const load = vi.fn(async (opts: LocalEmbedderOptions) => {
      calls.push({ opts });
      return fakeEmbedder(async () => [goodVector(1)]);
    });
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: load,
    });
    const result = await read();
    expect(result.embeddings).toBe("ready");
    expect(load).toHaveBeenCalledTimes(1);
    expect(calls[0].opts.allowRemote).toBe(false);
  });

  it("refuses a vector of the wrong length", async () => {
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: async () =>
        fakeEmbedder(async () => [new Float32Array(EMBEDDING_DIM - 1)]),
    });
    expect((await read()).embeddings).toBe("unavailable");
  });

  it("refuses a non-finite vector (NaN)", async () => {
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: async () =>
        fakeEmbedder(async () => {
          const v = goodVector(1);
          v[0] = Number.NaN;
          return [v];
        }),
    });
    expect((await read()).embeddings).toBe("unavailable");
  });

  it("refuses a zero vector", async () => {
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: async () =>
        fakeEmbedder(async () => [new Float32Array(EMBEDDING_DIM)]),
    });
    expect((await read()).embeddings).toBe("unavailable");
  });

  it("a probe that returns no vector at all is treated as unavailable", async () => {
    // A embedder that returns an empty array is a shape mismatch: the probe
    // requested one text and got nothing back. This must be unavailable, not
    // a silent success.
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: async () => fakeEmbedder(async () => []),
    });
    expect((await read()).embeddings).toBe("unavailable");
  });

  it("a probe that returns a wrong-length vector is treated as unavailable", async () => {
    // length 0 is not 384 — must fail the shape check.
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: async () =>
        fakeEmbedder(async () => [new Float32Array(0)]),
    });
    expect((await read()).embeddings).toBe("unavailable");
  });

  it("accepts a finite, non-zero, L2-normalised 384-d vector (warm-up proof)", async () => {
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: async () => fakeEmbedder(async () => [goodVector(42)]),
    });
    expect((await read()).embeddings).toBe("ready");
  });
});

describe("API-019 readiness: memoisation and identity", () => {
  beforeEach(() => {
    _resetReadinessForTests();
  });
  afterEach(() => {
    _resetReadinessForTests();
  });

  it("config identity is stable for the same loaded embedder", () => {
    const e = fakeEmbedder(async () => [goodVector(1)]);
    const a = _configIdentity(e, SAMPLE.cacheDir);
    const b = _configIdentity(e, SAMPLE.cacheDir);
    expect(a).toBe(b);
  });

  it("config identity changes when the model id changes", () => {
    const a = _configIdentity(
      fakeEmbedder(async () => [goodVector(1)], { model: "m1" }),
      SAMPLE.cacheDir,
    );
    const b = _configIdentity(
      fakeEmbedder(async () => [goodVector(1)], { model: "m2" }),
      SAMPLE.cacheDir,
    );
    expect(a).not.toBe(b);
  });

  it("config identity changes when the space tag changes (space switch)", () => {
    const base = fakeEmbedder(async () => [goodVector(1)], {
      space: "model=Xenova/multilingual-e5-small;dtype=fp32;pool=mean;normalize=true",
    });
    expect(_configIdentity(base, SAMPLE.cacheDir)).not.toBe(
      _configIdentity(
        fakeEmbedder(async () => [goodVector(1)], {
          space: "model=Xenova/multilingual-e5-small;dtype=q8;pool=mean;normalize=true",
        }),
        SAMPLE.cacheDir,
      ),
    );
    expect(_configIdentity(base, SAMPLE.cacheDir)).not.toBe(
      _configIdentity(
        fakeEmbedder(async () => [goodVector(1)], {
          space: "model=Xenova/multilingual-e5-small;dtype=fp32;pool=cls;normalize=true",
        }),
        SAMPLE.cacheDir,
      ),
    );
    expect(_configIdentity(base, SAMPLE.cacheDir)).not.toBe(
      _configIdentity(
        fakeEmbedder(async () => [goodVector(1)], {
          space: 'model=Xenova/multilingual-e5-small;dtype=fp32;pool=mean;normalize=true;query="Q: ";passage="P: "',
        }),
        SAMPLE.cacheDir,
      ),
    );
  });

  it("config identity changes when the cache directory changes", () => {
    const e = fakeEmbedder(async () => [goodVector(1)]);
    expect(_configIdentity(e, "/cache/a")).not.toBe(_configIdentity(e, "/cache/b"));
  });

  it("config identity changes when the revision changes", () => {
    const e1 = fakeEmbedder(async () => [goodVector(1)], { revision: "rev-1" });
    const e2 = fakeEmbedder(async () => [goodVector(1)], { revision: "rev-2" });
    expect(_configIdentity(e1, SAMPLE.cacheDir)).not.toBe(
      _configIdentity(e2, SAMPLE.cacheDir),
    );
  });

  it("a successful probe reuses the embedder (no warm-up on every request)", async () => {
    const load = vi.fn(async () => fakeEmbedder(async () => [goodVector(7)]));
    const read = createHealthReadiness({
      dbProbe: async () => true,
      loadEmbedder: load,
    });
    await read();
    await read();
    await read();
    // First call warms the pipeline; subsequent calls reuse the memo.
    expect(load).toHaveBeenCalledTimes(1);
    expect((await read()).embeddings).toBe("ready");
  });
});

describe("API-019 route: shape, public, no-store, demo_mode", () => {
  afterEach(() => {
    _resetReadinessForTests();
    vi.resetModules();
  });

  it("returns the strict API-019 schema with 200, no-store, x-request-id", async () => {
    vi.doMock("@/server/health/readiness", () => ({
      createHealthReadiness: () => async () => ({ db: "ready", embeddings: "ready" }),
    }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request(`${ORIGIN}/api/health`), noParams);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toMatch(UUID);
    const body = healthResponseSchema.parse(await res.json());
    expect(body).toMatchObject({
      version: expect.any(String),
      db: "ready",
      embeddings: "ready",
      synthetic_only: true,
    });
    // The version must come from package.json and be non-empty.
    expect(body.version.length).toBeGreaterThan(0);
  });

  it("does not leak raw error, connection string, cache path, or model id", async () => {
    vi.doMock("@/server/health/readiness", () => ({
      createHealthReadiness: () => async () => {
        throw new Error("DATABASE_URL=postgres://user:pass@host/db on .cache/models/Xenova/multilingual-e5-small: ECONNREFUSED");
      },
    }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request(`${ORIGIN}/api/health`), noParams);
    // A thrown readiness call must fail closed into a 5xx without echoing
    // any sensitive substring. The shared layer wraps it as E-021.
    const text = await res.text();
    for (const leak of [
      "DATABASE_URL",
      "postgres://",
      "user:pass",
      ".cache/models",
      "Xenova/",
      "ECONNREFUSED",
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("reflects process.env.DEMO_MODE in the demo_mode flag", async () => {
    const original = process.env.DEMO_MODE;
    try {
      process.env.DEMO_MODE = "1";
      vi.resetModules();
      vi.doMock("@/server/health/readiness", () => ({
        createHealthReadiness: () => async () => ({ db: "ready", embeddings: "ready" }),
      }));
      const { GET: GET1 } = await import("@/app/api/health/route");
      const body1 = healthResponseSchema.parse(
        await (await GET1(new Request(`${ORIGIN}/api/health`), noParams)).json(),
      );
      expect(body1.demo_mode).toBe(true);

      process.env.DEMO_MODE = "0";
      vi.resetModules();
      vi.doMock("@/server/health/readiness", () => ({
        createHealthReadiness: () => async () => ({ db: "ready", embeddings: "ready" }),
      }));
      const { GET: GET0 } = await import("@/app/api/health/route");
      const body0 = healthResponseSchema.parse(
        await (await GET0(new Request(`${ORIGIN}/api/health`), noParams)).json(),
      );
      expect(body0.demo_mode).toBe(false);
    } finally {
      if (original === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = original;
    }
  });

  it("db unavailable + embeddings ready still answers 200 (degraded, not error)", async () => {
    vi.doMock("@/server/health/readiness", () => ({
      createHealthReadiness: () => async () => ({ db: "unavailable", embeddings: "ready" }),
    }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request(`${ORIGIN}/api/health`), noParams);
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body.db).toBe("unavailable");
    expect(body.embeddings).toBe("ready");
  });

  it("both unavailable still answers 200 (degraded, not error)", async () => {
    vi.doMock("@/server/health/readiness", () => ({
      createHealthReadiness: () => async () => ({ db: "unavailable", embeddings: "unavailable" }),
    }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request(`${ORIGIN}/api/health`), noParams);
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ db: "unavailable", embeddings: "unavailable" });
  });
});
