# Fera AI — V2 team package

**Authors:** Sadman Shaharier; Obidit Islam. **Issued:** 11 October 2026, Asia/Dhaka. **Edition:** 2.0.

Start with `pdf/TEAM_HANDOVER_V2.pdf` for the change map, verification limits, corrected schedule and fillable meeting worksheet. `pdf/Fera_AI_Complete_Team_Handbook_V2.pdf` combines that workbook with all nine revised documents. Individual PDFs are in `pdf/`; editable sources are in `markdown/`.

The PDFs include clickable contents, bookmarks, requirement-definition links, external source links, rendered diagrams and searchable Bangla text. The workbook and complete handbook each have 15 blank form fields. Download/open them in a compatible PDF viewer to complete and save the meeting record. Cross-document links in an individual PDF expect the other PDFs alongside it; the complete handbook provides self-contained internal navigation.

The exact code companions are `code/schema_v2.sql`, `code/fera_types_v2.ts` and `code/tokens_v2.css`. They are embedded in D2A, D5 and D4 respectively. The SQL file targets a fresh isolated synthetic database; it is not an in-place V1 migration. Application role grants and target PostgreSQL 16 CI still need implementation verification.

`verification/` contains the schema check runner, scoped results and document/PDF checks. Strict shared-type compilation and 48 targeted schema behaviours passed. This is companion evidence, not an application acceptance report. The task board estimates 184 Round 2 hours; actual completed work and owner availability remain unverified.

All original inputs remain unchanged. The V2 package corrects the validation findings and retains stable requirement IDs. No implementation repository, actual quality metrics, provider/account configuration, partner approval, live referral delivery or completed real-case workflow is claimed. Only invented synthetic records are permitted in this release.

`MANIFEST.json` records each included file's SHA-256 hash. Keep a versioned meeting copy and attach evidence before marking acceptance/release gates complete.
