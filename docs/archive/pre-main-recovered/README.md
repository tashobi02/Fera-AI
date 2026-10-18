# Historical branch evidence recovered for pre-main

These records preserve work absent from the current runtime tree. They describe historical source commits, not current code, provider prices, owner approval, gate results or measured performance. Current facts live in [the pre-main closure](../../execution/pre-main-phase4-phase5-closure.md) and its durable verification.

`manifest.json` retains each source ref/commit, original path, archive path and original `sha256`/`bytes`. `archive_sha256`/`archive_bytes` describe the current archived copy. Original bytes were checked against Git source objects. Three archived files had environment-specific home paths removed by the external review commit `dcf350d`; their `archive_transform` records this explicitly. Other copies remain byte-identical. The old application and synthetic variants remain available through Git history. The archived SQL is historical and is not executed by active tooling.
