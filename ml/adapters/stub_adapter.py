"""StubAdapter — a weightless adapter that returns a canned ModelResult.

Purpose: unblock end-to-end testing before real models/GPUs exist. It runs no
inference; it echoes a canned, schema-valid payload declared in the SKU bundle
(``config.yaml`` -> ``params.stub.payload``). Per the scalability rule, the
canned SKU values live in the bundle, never in this code — so this single
adapter serves *any* SKU/result-type whose config supplies a stub payload.
"""

from __future__ import annotations

from pathlib import Path

from core.contracts import ImageInput, ModelAdapter, ModelResult, SkuConfig
from core.registry import register_adapter


@register_adapter("stub")
class StubAdapter(ModelAdapter):
    """Returns the canned ``params.stub.payload`` from the SKU config verbatim.

    The payload is validated into the frozen discriminated union by
    :class:`ModelResult`, so a malformed stub fails loudly at construction. The
    adapter is generic across result types: the ``type`` discriminator inside
    the canned payload decides the shape.
    """

    def __init__(self, config: SkuConfig, model_dir: Path) -> None:
        super().__init__(config, model_dir)
        stub = self.config.params.get("stub")
        if not isinstance(stub, dict) or "payload" not in stub:
            raise ValueError(
                f"StubAdapter for {self.config.sku_id!r} needs "
                "'params.stub.payload' in config.yaml"
            )
        self._payload = stub["payload"]
        self._model_version = str(stub.get("model_version", "stub"))

    def predict(self, image: ImageInput) -> ModelResult:  # noqa: ARG002 (canned)
        """Ignore the image; return the canned, validated envelope."""
        result = ModelResult(
            sku_id=self.config.sku_id,
            payload=self._payload,
            model_version=self._model_version,
            raw={"adapter": "stub", "note": "canned result; image ignored"},
        )
        # The stub must honor the SKU's declared result_type, exactly as a real
        # adapter would (the orchestrator asserts this at runtime).
        if result.result_type != self.config.result_type:
            raise ValueError(
                f"stub payload type {result.result_type.value!r} != declared "
                f"result_type {self.config.result_type.value!r} for "
                f"{self.config.sku_id!r}"
            )
        return result
