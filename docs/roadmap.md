# Deferred / production-only roadmap

These items were evaluated during design and deliberately excluded
from the V1 build. They must never appear as dead code, stub classes,
placeholder packages, or commented-out imports anywhere in `src/` —
if one of these is ever needed, it gets its own milestone and its own
ADR, not a silent addition here.

- **Kafka** — message/stream layer. V1 uses Redis Streams / an
  in-process asyncio queue instead.
- **Neo4j** — graph database for relationship modeling.
- **Bayesian Networks** — probabilistic risk modeling.
- **Graph Neural Networks** — not evaluated for V1's scale.
- **XGBoost** — not used; the Compound Risk Engine is a deterministic
  rule engine, not a trained model (see `src/domain/orchestrator/`).
- **LangGraph / CrewAI / heavy LangChain usage** — the LLM's role is
  scoped strictly to narrative generation and does not need an agent
  framework.
- **FAISS / Pinecone** — ChromaDB was chosen instead for the RAG
  vector store (M11).
- **Kubernetes** — Docker Compose is the only deployment target for
  V1; Kubernetes is a future production roadmap item only.
- **Full IEC 62443 zone enforcement / MOC workflow** — out of scope
  for the hackathon build; noted for a future production hardening
  pass.
