# V2 verification evidence

Authors: Sadman Shaharier; Obidit Islam. Issued 11 October 2026, Asia/Dhaka.

These files validate the delivered specification companions. They do not establish that the application has been implemented, deployed or approved for real-child use.

- `schema_checks.json`: 48 targeted sequential positive/negative checks, executed in PostgreSQL 18.3 through PGlite 0.5.8 with pgvector 0.8.1. Target PostgreSQL 16 CI, real role grants and application concurrency remain pending.
- `schema_checks.mjs`: portable runner for the same companion checks. It creates a fresh in-memory database; it never connects to a live database. A rerun overwrites only its JSON report in this folder.
- `document_checks.json`: embedded companion hashes/equality, registry count/uniqueness, task arithmetic/dependency path and Markdown table structure.
- `contrast_checks.json`: WCAG luminance arithmetic for the V2 border against each light/dark surface. Full component accessibility remains pending.
- `pdf_checks.json`: exported page/bookmark/link/form/author and layout checks; all pages also received visual review.

To rerun the SQL checks in an isolated copy with Node.js and package access:

```bash
npm install --no-save --ignore-scripts @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9
node verification/schema_checks.mjs
```

The package installs above are only for this verification runner, not the application stack. Review dependencies and maintain the real application lockfile separately. For the supplied shared types, strict compilation was performed with TypeScript 5.4.5:

```bash
tsc --strict --noEmit --target ES2020 --lib ES2020,DOM code/fera_types_v2.ts
```

No HTTP/service runtime validators, Next.js source, authentication implementation, dataset, provider configuration, spend log or quality evaluation result was supplied. D6 TC-001–066 are acceptance specifications; their presence is not evidence of execution.
