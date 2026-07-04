"""Per-SKU :class:`core.contracts.RulePlugin` implementations.

Each module registers its plugin class by id via
``@core.registry.register_plugin("<id>")``. Plugins hold pass/fail policy only:
no model code, no I/O. They read thresholds / expected values from the
:class:`core.contracts.SkuConfig` passed to ``evaluate`` — never hardcoded.
"""
