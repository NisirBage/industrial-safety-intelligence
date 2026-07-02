"""The Compound Risk Engine: scheduler, risk formula, tiering,
justification, and counterfactual comparator.

``scheduler.py`` (M5A) runs the four agents; ``risk_formula.py``
(M5B) fuses their results into a ``FusionResult``; ``tiering.py``
converts that into a stable per-zone ``TierState`` via asymmetric
hysteresis and dwell-time, without ever recomputing risk itself;
``justification.py`` combines all three (the scheduler's raw
``AgentResult``s, the ``FusionResult``, and a tier transition) into
the single frozen ``risk_assessments.justification`` shape (Master
Plan A.4), performing no computation of its own beyond reshaping and
aggregating.

``counterfactual.py`` is not part of that chain at all: it is a
deliberately separate, independent "naive single-threshold" baseline
evaluated against the same raw sensor data, sharing no code with any
other module in this package (Master Plan M5 task 5) - the honest
strawman that makes the "compound risk detection accuracy versus
single-sensor baselines" claim demonstrable rather than asserted. LLMs
and ML models never influence this package's output.
"""
