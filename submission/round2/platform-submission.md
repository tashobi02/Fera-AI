# Round 2 platform submission (h4hbd.ezassist.me)

Repository-attributed organiser instructions (the entry committed at `9690361` says received 18 Oct 2026 and relayed by Mahim; the original organiser message and current platform state are independently UNVERIFIED): upload the project to the LooselyCoupled Technology AI Worker Platform at <https://h4hbd.ezassist.me/>. The platform shows the prototype deadline as **18 Oct 2026, 10:00 PM (GMT+6)**. PPT: at most 8 slides, no fixed format. Video: Bangla or English, no fixed format.

Platform route for a project built elsewhere: team workspace → **Upload a solution** → fill the fields below → Save → open the saved demo link in a new tab and confirm it loads → choose a track → Submit. Submitting locks the entry; only an organiser can reopen it. Every link must be a public HTTPS URL and the repository must be on GitHub.

Status: SUBMITTED on the platform by a team member, as reported by Mahim (lead) on 18 Oct 2026. Exact time, submitter and platform status are not yet recorded; see the record below.

## Before pasting

- [ ] Repository `tashobi02/Fera-AI` is public (secret scan of tracked files on 18 Oct found only placeholder URLs in test fixtures).
- [ ] Showcase page is shared publicly from its Share menu, and it opens in a private window.
- [ ] Optional: the demo video is uploaded to YouTube (unlisted) from `submission/demo/final-submission.mp4`; if so, use that URL as the video URL.

## Fields

**Project name**

Fera AI (ফেরা)

**Description**

Fera is a Bangla-first case coordination prototype for missing and found children in Bangladesh. A parent reports by voice or typed Bangla, reviews every extracted field, and submits only after confirming; unknown values stay unknown. Shelter and station staff log found children. AI retrieves and ranks possible matches by similarity, and a verified officer compares the two reports side by side and records the decision. Confirmation runs as one database transaction with an append-only audit trail; the officer then closes the case and district counts update.

Built with Next.js, strict TypeScript, PostgreSQL 16 + pgvector and local multilingual-e5-small embeddings: 16 screens in Bangla and English, 22 role-scoped API routes, with a recorded baseline of 3,693 unit tests, 320 database tests and 78 browser checks passing as of application commit 9155963 (remote CI run 39114757484; see slide 7 and the README verification note). Counts are a development baseline, not a release measurement, and may be re-recorded at the next commit before any submission.

This is a synthetic-data prototype: no real child data, [MOCK] officer verification, referral recorded as a simulation, no alerts and no police or CID integration. Release metrics are not measured yet; development diagnostics with denominators are on the showcase page.

**Public HTTPS demo link**

https://claude.ai/artifact/TUnGks7FebMyPRKfZqZnfh (showcase page with the recording, screens and links; share publicly first)

**Demo video URL**

YouTube URL if uploaded; otherwise the showcase link above (the platform guide allows the same URL in both demo fields).

**GitHub repository URL**

https://github.com/tashobi02/Fera-AI

**Presentation link (optional)**

https://github.com/tashobi02/Fera-AI/blob/main/submission/round2/fera-round2-deck.pdf (8 slides; shows the updated deck once this branch is on `main`, otherwise use the showcase page's PDF link)

**Track**

Track 3, Smart Society & Public Services (per docs/spec/D5_Background_Schema_V2.md and TEAM_HANDOVER_V2.md). The exact option selected on the form is UNKNOWN to this record.

## Submission record

- Submitted by: a team member (name UNKNOWN to this record)
- Submitted at (Asia/Dhaka): 18 Oct 2026, exact time UNKNOWN (recorded in this file at 22:12 Asia/Dhaka from Mahim's report; that is not the submission time)
- Platform status after submit: UNKNOWN (check the platform; record "Submitted" and the time here)
- Source: Mahim (lead), in chat, 18 Oct 2026
