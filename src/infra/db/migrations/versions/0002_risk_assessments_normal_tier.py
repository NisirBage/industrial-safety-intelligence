"""Extend risk_assessments.tier to allow 'normal'.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-02

The 0001 CHECK constraint (``tier IN ('watch', 'elevated', 'critical')``)
predates the Tiering (Hysteresis) Engine, whose frozen ``TIER_ORDER``
(``src/domain/orchestrator/tiering.py``) legitimately includes
``"normal"`` as the default state of any calm zone. Since
``risk_assessments`` is a Timescale hypertable meant to hold one row
per zone per tick continuously (not only when a zone is elevated), the
Risk Pipeline would fail this constraint on the majority of ticks
without this fix - flagged and approved during the System Integration
Layer's Phase 0 planning.

Purely additive: 0001 is not modified. A new migration widens the
constraint instead.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_risk_assessments_tier", "risk_assessments", type_="check")
    op.create_check_constraint(
        "ck_risk_assessments_tier",
        "risk_assessments",
        "tier IN ('normal', 'watch', 'elevated', 'critical')",
    )


def downgrade() -> None:
    # Migration 0001's constraint never allowed 'normal', so a row with
    # that tier cannot be represented once this downgrade re-applies
    # the stricter check below - re-creating the constraint would
    # immediately fail with a CheckViolation on any such row. There is
    # no non-destructive way to downgrade this data: reassigning it to
    # 'watch'/'elevated'/'critical' would fabricate a tier the pipeline
    # never actually computed, which is worse than deleting it. This
    # downgrade is therefore intentionally lossy for 'normal' rows -
    # acceptable because 0001 predates the Tiering Engine's "normal"
    # state entirely and never had a schema capable of holding it.
    op.execute("DELETE FROM risk_assessments WHERE tier = 'normal'")
    op.drop_constraint("ck_risk_assessments_tier", "risk_assessments", type_="check")
    op.create_check_constraint(
        "ck_risk_assessments_tier",
        "risk_assessments",
        "tier IN ('watch', 'elevated', 'critical')",
    )
