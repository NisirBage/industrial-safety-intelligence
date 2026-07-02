"""The Compound Risk Engine: scheduler, risk formula, tiering,
justification, and counterfactual comparator.

``scheduler.py`` (M5A) provides the three-level execution graph -
static and explicitly declared, never dynamically discovered - that
runs the four agents in dependency order with a last-known-value
fallback for a failing agent. Fusion (the weighted-sum-plus-
interaction-bonus formula), hysteresis/tiering, the justification-
object builder, and the counterfactual comparator remain reserved,
not yet built. LLMs and ML models never influence this package's
output.
"""
