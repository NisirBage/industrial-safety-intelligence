"""The Compound Risk Engine: scheduler, risk formula, tiering,
justification, and counterfactual comparator.

``scheduler.py`` (M5A) runs the four agents; ``risk_formula.py``
(M5B) fuses their results into one ``FusionResult`` via the weighted-
sum-plus-interaction-bonus formula, consuming scheduler output only -
it executes no agent and touches no repository. Hysteresis/tiering,
the full justification-object builder, and the counterfactual
comparator remain reserved, not yet built. LLMs and ML models never
influence this package's output.
"""
