"""The Compound Risk Engine: scheduler, risk formula, tiering,
justification, and counterfactual comparator.

``scheduler.py`` (M5A) runs the four agents; ``risk_formula.py``
(M5B) fuses their results into a ``FusionResult``; ``tiering.py``
converts that into a stable per-zone ``TierState`` via asymmetric
hysteresis and dwell-time, without ever recomputing risk itself. The
full justification-object builder (which will read ``tiering.py``'s
output for ``tier_before``/``tier_after``) and the counterfactual
comparator remain reserved, not yet built. LLMs and ML models never
influence this package's output.
"""
