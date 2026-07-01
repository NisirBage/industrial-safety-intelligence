# 0001 — Incidents table holds no vector column; embeddings live only in Chroma

## Status

Accepted

## Context

The Technical Review's original schema (§7.6) specifies an `embedding`
(vector) column directly on the `incidents` table. Separately, the
Master Plan's chosen tech stack (A.2/A.11) uses ChromaDB as the
platform's only vector store, for the RAG incident-intelligence
feature built in M11. No pgvector extension is part of the chosen
`timescale/timescaledb:latest-pg16` image or anywhere else in the
approved stack.

Implementing `incidents.embedding` literally would require adding an
unplanned Postgres extension and would create two sources of truth
for the same embedding — one in Postgres, one in Chroma — with no
defined synchronization mechanism between them.

## Decision

The relational `incidents` table (created in M1) stores structured
metadata only: `incident_id`, `source`, `description`,
`linked_zone_id`, `date`. No vector/embedding column exists in
PostgreSQL. Vector embeddings are stored exclusively in ChromaDB
(added in M11), keyed by `incident_id`, so the two stores are linked
by that shared identifier rather than by duplicating the vector.

The relational database remains the authoritative source for
structured data; ChromaDB is authoritative for embeddings.

## Consequences

- M11 (RAG incident intelligence) must key its Chroma collection by
  `incident_id` and look up structured metadata via the
  `IncidentRepository` rather than duplicating it into Chroma's
  metadata payload beyond what retrieval needs.
- No pgvector extension is required anywhere in this project.
- This does not change the overall architecture (Postgres = relational
  system of record, Chroma = vector store) — it resolves an
  inconsistency between two source documents in favor of the already-
  approved tech stack.
