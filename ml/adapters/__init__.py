"""Per-SKU :class:`core.contracts.ModelAdapter` implementations.

Each module registers its adapter class by id via
``@core.registry.register_adapter("<id>")``. The registry imports every
submodule of this package on discovery, so adding an adapter = dropping a new
module here and referencing its id from a SKU's ``config.yaml``. No core edits.
"""
