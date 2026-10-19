# Audit table growth and partitioning plan

`audit_log` remains a single append only table. No table growth rate, query latency, or retention target has been measured for this synthetic prototype, so partitioning is not enabled yet. The schema adds separate indexes for case history, time, actor, action, and non-null request IDs.

Before partitioning, collect row counts, index sizes, write latency, and the actual operator query mix. Then choose a time range from measured growth and query needs. A partition migration must keep the append only triggers, database clock default, per-role projections, and all existing rows intact. It must also account for PostgreSQL's requirement that a unique key on a partitioned table include the partition key; `audit_log.id` is currently the primary key. Use a shadow table and a reviewed cutover plan rather than applying `PARTITION BY` in place.

Until those measurements and the migration design exist, keep the indexed heap table and report metrics as not measured.
