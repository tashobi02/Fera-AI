// scripts/release/check.d.mts
//
// Type declarations for the plain ESM script at scripts/release/check.mjs.
// Mirrors the .mjs exports so consumers in TypeScript get a real type
// instead of an implicit any. The .mjs source is the source of truth;
// this file is hand-written and intentionally minimal.

export type CheckStatus = "PASS" | "FAIL" | "UNVERIFIED" | "REFUSED" | "INFO";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface RunChecksOptions {
  /** Override the repo root (default: this worktree's repo root). */
  repoRoot?: string;
  /** Dependency-injection seam used by tests. Production must leave this null. */
  fetcher?: ((input: string, init?: RequestInit) => Promise<Response>) | null;
  /** Path to write the markdown readiness report (resolved inside repoRoot). */
  writeReportPath?: string | null;
  /** Repo-relative paths to the link source files. */
  sourceFiles?: readonly string[];
  /** Optional allowlist override (default: built-in ALLOWLIST). */
  allowlist?: ReadonlyArray<readonly [string, string]>;
}

export interface RunChecksSummary {
  generatedAt: string;
  repoRoot: string;
  checks: CheckResult[];
  // Exit codes:
  //   0  every required offline check PASS, no UNVERIFIED
  //   1  a required offline check FAIL (real local problem)
  //   2  every local check PASS, only UNVERIFIED external URLs remain
  //   3  bad usage (raised by the CLI parseArgs path)
  exit: 0 | 1 | 2 | 3;
}

export type UrlClass = "loopback" | "external" | "invalid";

export interface ManifestEntry {
  name: string;
  status: CheckStatus;
  detail: string;
  bytes?: number;
  sha256?: string;
}

export interface ExtractedReferences {
  urls: string[];
  paths: string[];
}

export const ALLOWLIST: ReadonlyArray<readonly [string, string]>;
export const EXCLUDED_FROM_SUBMISSION: Readonly<Record<string, { status: string; note: string }>>;

export function buildManifest(repoRoot?: string, allowlist?: ReadonlyArray<readonly [string, string]>): ManifestEntry[];
export function classifyUrl(raw: string): UrlClass;
export function extractReferences(text: string): ExtractedReferences;
export function runChecks(options?: RunChecksOptions): Promise<RunChecksSummary>;

export class ReleaseUsageError extends Error {
  name: string;
}
