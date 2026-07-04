"""Frozen contracts — the spine of the multi-SKU inspection pipeline.

These types are the ONE source of truth. They are imported everywhere and
redefined nowhere. Adapters (per-SKU), rule plugins (per-SKU), the registry,
the backend runtime path, and the validation runner all speak in these types.

Editing rules (non-negotiable):
  * This file is owned by the core/backend chat ONLY. No other track edits it.
  * No SKU is ever named here. Nothing branches on ``sku_id``. Dispatch happens
    by ``sku_id`` (which bundle to load) and by :class:`ResultType` (how to
    interpret / validate a result) — never by hardcoded product identity.

--------------------------------------------------------------------------------
Adding a new ResultType (the ONLY expected extension) — controlled 4-step change:
  1. Add a member to :class:`ResultType`.
  2. Define its payload model (subclass of :class:`_Payload`) with
     ``type: Literal[ResultType.<new>]`` as its discriminator.
  3. Add the payload to the ``_PayloadUnion`` discriminated union below.
  4. Register a reduction for it in ``ml/validate.py`` (result-type -> confusion
     matrix). The conformance test enforces every ResultType has a validator.
Do all four in one reviewed change. Anything less breaks a guarantee.
--------------------------------------------------------------------------------
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from os import PathLike
from pathlib import Path
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, computed_field


# --------------------------------------------------------------------------- #
# Result taxonomy                                                             #
# --------------------------------------------------------------------------- #
class ResultType(str, Enum):
    """How a model's output is shaped. Dispatch key for interpret + validate."""

    detection = "detection"
    classification = "classification"
    measurement = "measurement"


# --------------------------------------------------------------------------- #
# Type-specific payloads                                                       #
#                                                                              #
# Each payload carries a ``type`` discriminator so the envelope can be         #
# validated and dispatched without any knowledge of which SKU produced it.     #
# --------------------------------------------------------------------------- #
class _Payload(BaseModel):
    """Base for all result payloads. Frozen once populated."""

    model_config = ConfigDict(frozen=True)


class BoundingBox(BaseModel):
    """Axis-aligned box in pixel coordinates (top-left origin)."""

    model_config = ConfigDict(frozen=True)

    x: float
    y: float
    width: float
    height: float


class Detection(BaseModel):
    """A single detected instance."""

    model_config = ConfigDict(frozen=True)

    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    box: BoundingBox


class DetectionPayload(_Payload):
    type: Literal[ResultType.detection] = ResultType.detection
    detections: list[Detection] = Field(default_factory=list)


class ClassificationPayload(_Payload):
    type: Literal[ResultType.classification] = ResultType.classification
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    #: Optional full class -> score distribution (need not sum to 1).
    scores: dict[str, float] = Field(default_factory=dict)


class Measurement(BaseModel):
    """A single named scalar measurement, optionally with a unit."""

    model_config = ConfigDict(frozen=True)

    name: str
    value: float
    unit: str | None = None


class MeasurementPayload(_Payload):
    type: Literal[ResultType.measurement] = ResultType.measurement
    measurements: list[Measurement] = Field(default_factory=list)


#: Discriminated union of all payloads. Extended in step 3 above.
_PayloadUnion = Annotated[
    Union[DetectionPayload, ClassificationPayload, MeasurementPayload],
    Field(discriminator="type"),
]


# --------------------------------------------------------------------------- #
# The uniform envelope                                                         #
# --------------------------------------------------------------------------- #
class ModelResult(BaseModel):
    """Uniform, type-tagged envelope returned by every :class:`ModelAdapter`.

    The envelope carries traceability metadata common to all SKUs; the
    ``payload`` holds the type-specific data. Downstream code dispatches on
    :attr:`result_type` (a :class:`ResultType`), never on :attr:`sku_id`.
    """

    model_config = ConfigDict(frozen=True)

    sku_id: str
    payload: _PayloadUnion
    #: Optional identifier of the model/weights that produced this result.
    model_version: str | None = None
    #: Optional raw adapter output, kept for traceability/debugging.
    raw: dict[str, Any] = Field(default_factory=dict)

    @computed_field  # serialized + published in the OpenAPI schema
    @property
    def result_type(self) -> ResultType:
        """The tag used to interpret and validate this result.

        Derived from the payload's discriminator so it can never disagree with
        it, but surfaced as a top-level field for consumers that switch on the
        result shape without reaching into ``payload``.
        """
        return self.payload.type


# --------------------------------------------------------------------------- #
# Verdict                                                                       #
# --------------------------------------------------------------------------- #
class Verdict(BaseModel):
    """The pass/fail outcome of an inspection, with a human-readable reason."""

    model_config = ConfigDict(frozen=True)

    passed: bool
    #: Human-readable justification. Always populated (traceability, G3).
    reason: str
    #: Structured supporting evidence (measured values, thresholds, etc.).
    details: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Per-SKU configuration (loaded from skus/<id>/config.yaml)                     #
# --------------------------------------------------------------------------- #
class SkuConfig(BaseModel):
    """Declarative configuration for one SKU bundle.

    This is the ``config`` handed to :meth:`RulePlugin.evaluate`. It names the
    adapter and plugin to resolve (by id) and carries the thresholds / class
    list / freeform params a plugin needs. It never contains executable logic.
    """

    model_config = ConfigDict(extra="forbid")

    sku_id: str
    name: str | None = None
    #: Declared shape of this SKU's model output. Must match what its adapter
    #: actually returns (asserted at runtime by the orchestrator).
    result_type: ResultType
    #: Registry ids used to resolve the concrete adapter / plugin classes.
    adapter_id: str
    plugin_id: str
    #: Class list for detection/classification SKUs (informational + validation).
    classes: list[str] = Field(default_factory=list)
    #: Named thresholds consumed by the rule plugin (e.g. min confidence).
    thresholds: dict[str, float] = Field(default_factory=dict)
    #: Freeform params for adapter/plugin (model filename, tolerances, ...).
    params: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# The two per-SKU extension points                                             #
# --------------------------------------------------------------------------- #
#: What an adapter accepts as an image: raw bytes, or a filesystem path.
ImageInput = Union[bytes, str, PathLike]


class ModelAdapter(ABC):
    """Wraps a SKU's model and normalizes its output to a :class:`ModelResult`.

    One concrete subclass per SKU, living in ``ml/adapters/`` and registered by
    id via :func:`core.registry.register_adapter`. The registry instantiates it
    with the SKU's :class:`SkuConfig` and bundle root so it can locate weights.
    Implementations are the ONLY place a specific model library appears.
    """

    def __init__(self, config: SkuConfig, model_dir: Path) -> None:
        self.config = config
        self.model_dir = model_dir

    @abstractmethod
    def predict(self, image: ImageInput) -> ModelResult:
        """Run inference on one image and return a typed envelope."""
        raise NotImplementedError


class RulePlugin(ABC):
    """Turns a :class:`ModelResult` into a pass/fail :class:`Verdict`.

    One concrete subclass per SKU, living in ``plugins/`` and registered by id
    via :func:`core.registry.register_plugin`. Holds the SKU's pass/fail policy
    and nothing else — no model code, no I/O.
    """

    @abstractmethod
    def evaluate(self, result: ModelResult, config: SkuConfig) -> Verdict:
        """Apply this SKU's pass/fail policy to a result."""
        raise NotImplementedError


__all__ = [
    "ResultType",
    "BoundingBox",
    "Detection",
    "DetectionPayload",
    "ClassificationPayload",
    "Measurement",
    "MeasurementPayload",
    "ModelResult",
    "Verdict",
    "SkuConfig",
    "ImageInput",
    "ModelAdapter",
    "RulePlugin",
]
