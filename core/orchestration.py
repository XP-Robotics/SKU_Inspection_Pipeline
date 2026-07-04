"""Runtime orchestration — the one path every inspection walks.

    identify SKU -> load bundle -> predict -> evaluate -> verdict -> log

This is shared code. It dispatches by ``sku_id`` (which bundle the registry
loads) and by :class:`ResultType` (the ``result_type`` consistency check). It
never branches on the identity of a particular SKU.
"""

from __future__ import annotations

from core.contracts import ImageInput, ModelResult, Verdict
from core.logging import InspectionLogger, InspectionRecord
from core.registry import SkuBundle, SkuRegistry


class OrchestrationError(RuntimeError):
    """Raised when the runtime path cannot complete for a well-formed request."""


class InspectionService:
    """Holds the shared runtime dependencies and runs the inspection path.

    A single long-lived instance is created by the backend at startup. Adapters
    and plugins are resolved per request from the registry, so a bundle can be
    re-registered / retrained without restarting the service.
    """

    def __init__(self, registry: SkuRegistry, logger: InspectionLogger) -> None:
        self._registry = registry
        self._logger = logger

    def discover(self) -> list[str]:
        """Ids of every registered SKU bundle."""
        return self._registry.discover()

    def load_bundle(self, sku_id: str) -> SkuBundle:
        """Step 1-2: identify the SKU and load its bundle from the registry."""
        return self._registry.load(sku_id)

    def inspect(self, sku_id: str, image: ImageInput) -> InspectionRecord:
        """Run the full runtime path for one product and log the outcome."""
        bundle = self.load_bundle(sku_id)

        adapter = self._registry.resolve_adapter(bundle)
        plugin = self._registry.resolve_plugin(bundle)

        # Step 4: predict -> typed envelope.
        result = adapter.predict(image)
        self._check_result(bundle, result)

        # Step 5: evaluate -> verdict.
        verdict = plugin.evaluate(result, bundle.config)
        self._check_verdict(bundle, verdict)

        # Step 6: log and return.
        record = InspectionRecord(sku_id=sku_id, result=result, verdict=verdict)
        self._logger.log(record)
        return record

    # -- contract guards ---------------------------------------------------- #
    @staticmethod
    def _check_result(bundle: SkuBundle, result: ModelResult) -> None:
        if result.sku_id != bundle.sku_id:
            raise OrchestrationError(
                f"adapter returned sku_id {result.sku_id!r}, "
                f"expected {bundle.sku_id!r}"
            )
        if result.result_type != bundle.config.result_type:
            raise OrchestrationError(
                f"adapter returned result_type {result.result_type.value!r}, "
                f"config declares {bundle.config.result_type.value!r}"
            )

    @staticmethod
    def _check_verdict(bundle: SkuBundle, verdict: Verdict) -> None:
        if not verdict.reason:
            raise OrchestrationError(
                f"plugin {bundle.config.plugin_id!r} returned a verdict with no "
                "reason (traceability requires one)"
            )


__all__ = ["InspectionService", "OrchestrationError"]
