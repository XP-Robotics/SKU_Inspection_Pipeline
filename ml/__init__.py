"""ml: shared training/validation runners + per-SKU model adapters.

Per-SKU adapters live in ``ml.adapters`` and self-register by id. Nothing here
redefines a core contract; everything imports from ``core.contracts``.
"""
