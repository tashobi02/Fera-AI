// Real HTTP gates: protected cache, fail-closed spend, and owner-scoped reads.
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { extractResponseSchema, createMissingResponseSchema, errorEnvelopeSchema } from "../../src/contracts";
import { exampleCreateMissingRequest } from "../../src/contracts/examples";
import { EXTRACT_FIXTURE_SOURCE } from "../../src/server/cache/fixtures";
import { deskContext, ownerClient, seedReferenceDistrict } from "./support/fixtures";

test.beforeAll(async()=>{const db=await ownerClient();try{await seedReferenceDistrict(db);}finally{await db.end();}});
const notice={"x-fera-provider-notice":"v1"};
async function reservations(db:Awaited<ReturnType<typeof ownerClient>>) {
  return Number((await db.query("SELECT count(*)::int AS n FROM ai_reservations")).rows[0].n);
}
test("API-002 exact DEMO cache creates metadata only and consumes zero paid slots",async({baseURL})=>{
  const ctx=await deskContext(baseURL!,baseURL!);const db=await ownerClient();
  try {
    const before=await reservations(db);const cases=Number((await db.query("SELECT count(*)::int AS n FROM cases")).rows[0].n);
    const response=await ctx.post("/api/intake/extract",{headers:notice,data:{kind:"missing",text:EXTRACT_FIXTURE_SOURCE}});
    expect(response.status()).toBe(200);const body=extractResponseSchema.parse(await response.json());
    expect(body.cached).toBe(true);expect(body.ai_calls_used).toBe(0);expect(body.draft.source_text).toBe(EXTRACT_FIXTURE_SOURCE);
    expect(await reservations(db)).toBe(before);
    expect(Number((await db.query("SELECT count(*)::int AS n FROM cases")).rows[0].n)).toBe(cases);
    const row=(await db.query("SELECT ai_calls_used,payload_hash FROM intake_drafts WHERE id=$1",[body.draft_id])).rows[0];
    expect(row.ai_calls_used).toBe(0);expect(row.payload_hash).toMatch(/^[0-9a-f]{64}$/);
  } finally {await ctx.dispose();await db.end();}
});
test("API-002 cache miss with UNKNOWN prices refuses before any paid reservation",async({baseURL})=>{
  const ctx=await deskContext(baseURL!,baseURL!);const db=await ownerClient();
  try {
    const before=await reservations(db);
    const response=await ctx.post("/api/intake/extract",{headers:notice,data:{kind:"missing",text:"[MOCK] এই বাক্যটি কোনো ফিক্সচারের সাথে মেলে না"}});
    expect(response.status()).toBe(429);expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-023");
    expect(await reservations(db)).toBe(before);
  } finally {await ctx.dispose();await db.end();}
});
test("two real parent cookies: own read succeeds, cross-owner read is E-004 with denied-access audit",async({baseURL})=>{
  const a=await deskContext(baseURL!,baseURL!);const b=await deskContext(baseURL!,baseURL!);const db=await ownerClient();
  try {
    const create=()=>({...exampleCreateMissingRequest,client_submission_id:randomUUID(),draft:{...exampleCreateMissingRequest.draft,event:{...exampleCreateMissingRequest.draft.event,district_code:1}}});
    const ra=await a.post("/api/cases",{data:create()});expect(ra.status()).toBe(201);const ca=createMissingResponseSchema.parse(await ra.json());
    const rb=await b.post("/api/cases",{data:create()});expect(rb.status()).toBe(201);const cb=createMissingResponseSchema.parse(await rb.json());
    expect((await a.get(`/api/cases/${ca.id}`)).status()).toBe(200);
    expect((await b.get(`/api/cases/${cb.id}`)).status()).toBe(200);
    const denied=await b.get(`/api/cases/${ca.id}`);expect(denied.status()).toBe(404);
    const envelope=errorEnvelopeSchema.parse(await denied.json());expect(envelope.error.id).toBe("E-004");expect(JSON.stringify(envelope)).not.toContain(ca.id);
    const rid=denied.headers()["x-request-id"];expect(rid).toMatch(/^[0-9a-f-]{36}$/);
    const rows=(await db.query("SELECT action,case_id FROM audit_log WHERE request_id=$1 AND action='access.denied'",[rid])).rows;
    expect(rows).toHaveLength(1);expect(rows[0].case_id).toBe(ca.id);
  } finally {await a.dispose();await b.dispose();await db.end();}
});
