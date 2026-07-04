"""SKU registry — discover bundles on disk and resolve their plugins by id.

Two responsibilities, both id-driven and both free of SKU-specific branching:

  1. **Bundle discovery / loading.** Scan ``skus/<sku_id>/``, parse ``config.yaml``
     (-> :class:`SkuConfig`) and ``sop.yaml``, and expose a :class:`SkuBundle`.
  2. **Adapter / plugin resolution.** Per-SKU adapters (``ml/adapters/``) and rule
     plugins (``plugins/``) register themselves *by id* via the decorators here.
     The registry maps ``adapter_id`` / ``plugin_id`` -> concrete class and
     instantiates them for a bundle.

Dispatch is by id, never by identity: this module contains no ``if sku_id == ...``.
"""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict

from core.contracts import ModelAdapter, RulePlugin, SkuConfig

# --------------------------------------------------------------------------- #
# Registration tables (id -> concrete class)                                   #
# --------------------------------------------------------------------------- #
_ADAPTERS: dict[str, type[ModelAdapter]] = {}
_PLUGINS: dict[str, type[RulePlugin]] = {}

#: Packages the registry imports to trigger @register_* side effects. Guarded —
#: absent packages are simply skipped, so core stands alone in tests.
_ADAPTER_PACKAGE = "ml.adapters"
_PLUGIN_PACKAGE = "plugins"


class RegistryError(RuntimeError):
    """Raised when a bundle, adapter, or plugin cannot be resolved."""


class BundleExistsError(RegistryError):
    """Raised when creating a bundle whose ``skus/<id>/`` already exists."""


def register_adapter(adapter_id: str):
    """Decorator: register a :class:`ModelAdapter` subclass under ``adapter_id``."""

    def _decorate(cls: type[ModelAdapter]) -> type[ModelAdapter]:
        if not issubclass(cls, ModelAdapter):
            raise RegistryError(f"{cls!r} is not a ModelAdapter")
        existing = _ADAPTERS.get(adapter_id)
        if existing is not None and existing is not cls:
            raise RegistryError(f"adapter id {adapter_id!r} already registered")
        _ADAPTERS[adapter_id] = cls
        return cls

    return _decorate


def register_plugin(plugin_id: str):
    """Decorator: register a :class:`RulePlugin` subclass under ``plugin_id``."""

    def _decorate(cls: type[RulePlugin]) -> type[RulePlugin]:
        if not issubclass(cls, RulePlugin):
            raise RegistryError(f"{cls!r} is not a RulePlugin")
        existing = _PLUGINS.get(plugin_id)
        if existing is not None and existing is not cls:
            raise RegistryError(f"plugin id {plugin_id!r} already registered")
        _PLUGINS[plugin_id] = cls
        return cls

    return _decorate


# --------------------------------------------------------------------------- #
# Bundle model                                                                 #
# --------------------------------------------------------------------------- #
class SkuBundle(BaseModel):
    """A loaded SKU bundle: parsed config + SOP + resolved on-disk paths."""

    model_config = ConfigDict(arbitrary_types_allowed=True, frozen=True)

    sku_id: str
    root: Path
    config: SkuConfig
    sop: dict[str, Any]
    data_dir: Path
    model_dir: Path
    metrics_dir: Path


# --------------------------------------------------------------------------- #
# Registry                                                                     #
# --------------------------------------------------------------------------- #
class SkuRegistry:
    """Discovers bundles under ``skus_root`` and resolves their plugins."""

    CONFIG_FILE = "config.yaml"
    SOP_FILE = "sop.yaml"

    def __init__(self, skus_root: str | Path, *, autodiscover: bool = True) -> None:
        self.skus_root = Path(skus_root)
        if autodiscover:
            discover_plugins()

    # -- discovery ---------------------------------------------------------- #
    def discover(self) -> list[str]:
        """Return the sorted ids of every bundle directory under ``skus_root``.

        A bundle is any directory containing a ``config.yaml``.
        """
        if not self.skus_root.is_dir():
            return []
        ids = [
            child.name
            for child in self.skus_root.iterdir()
            if child.is_dir() and (child / self.CONFIG_FILE).is_file()
        ]
        return sorted(ids)

    # -- loading ------------------------------------------------------------ #
    def load(self, sku_id: str) -> SkuBundle:
        """Load and validate the bundle for ``sku_id``."""
        root = self.skus_root / sku_id
        config_path = root / self.CONFIG_FILE
        if not config_path.is_file():
            raise RegistryError(f"no bundle for sku_id {sku_id!r} at {root}")

        raw_config = _read_yaml(config_path)
        # ``sku_id`` in the config must agree with the folder it lives in.
        raw_config.setdefault("sku_id", sku_id)
        if raw_config["sku_id"] != sku_id:
            raise RegistryError(
                f"config sku_id {raw_config['sku_id']!r} != folder {sku_id!r}"
            )
        config = SkuConfig.model_validate(raw_config)

        sop_path = root / self.SOP_FILE
        sop = _read_yaml(sop_path) if sop_path.is_file() else {}

        return SkuBundle(
            sku_id=sku_id,
            root=root,
            config=config,
            sop=sop,
            data_dir=root / "data",
            model_dir=root / "model",
            metrics_dir=root / "metrics",
        )

    # -- creation ----------------------------------------------------------- #
    def create(self, config: SkuConfig) -> SkuBundle:
        """Scaffold a new bundle on disk from its declarative ``config``.

        Build phase step 1 ("Define SKU"): writes ``config.yaml`` and the empty
        ``data/`` ``model/`` ``metrics/`` dirs plus a minimal ``sop.yaml`` stub.
        Purely data + directories — the adapter/plugin named by id are NOT
        resolved here; a bundle is created even if they don't exist yet and only
        becomes runnable once they do. Generic across SKUs: no identity branching.
        """
        root = self.skus_root / config.sku_id
        if root.exists():
            raise BundleExistsError(f"bundle {config.sku_id!r} already exists at {root}")

        (root / "data").mkdir(parents=True)
        (root / "model").mkdir()
        (root / "metrics").mkdir()
        _write_yaml(root / self.CONFIG_FILE, _config_to_yaml_dict(config))
        _write_yaml(root / self.SOP_FILE, _sop_stub(config.sku_id))

        # ``discover``/``load`` read the disk live, so the new bundle is visible
        # immediately with no explicit rescan.
        return self.load(config.sku_id)

    # -- resolution --------------------------------------------------------- #
    def resolve_adapter(self, bundle: SkuBundle) -> ModelAdapter:
        """Instantiate the adapter named by ``bundle.config.adapter_id``."""
        cls = _ADAPTERS.get(bundle.config.adapter_id)
        if cls is None:
            raise RegistryError(
                f"adapter id {bundle.config.adapter_id!r} not registered "
                f"(known: {sorted(_ADAPTERS)})"
            )
        return cls(bundle.config, bundle.model_dir)

    def resolve_plugin(self, bundle: SkuBundle) -> RulePlugin:
        """Instantiate the rule plugin named by ``bundle.config.plugin_id``."""
        cls = _PLUGINS.get(bundle.config.plugin_id)
        if cls is None:
            raise RegistryError(
                f"plugin id {bundle.config.plugin_id!r} not registered "
                f"(known: {sorted(_PLUGINS)})"
            )
        return cls()


# --------------------------------------------------------------------------- #
# Plugin auto-discovery                                                        #
# --------------------------------------------------------------------------- #
def discover_plugins() -> None:
    """Import the adapter/plugin packages so their registrations run.

    Best-effort: if ``ml.adapters`` or ``plugins`` do not exist yet (early build,
    or core-only tests), they are skipped rather than raising.
    """
    for package_name in (_ADAPTER_PACKAGE, _PLUGIN_PACKAGE):
        _import_submodules(package_name)


def _import_submodules(package_name: str) -> None:
    try:
        package = importlib.import_module(package_name)
    except ModuleNotFoundError:
        return
    package_path = getattr(package, "__path__", None)
    if package_path is None:
        return
    for info in pkgutil.iter_modules(package_path):
        importlib.import_module(f"{package_name}.{info.name}")


# --------------------------------------------------------------------------- #
# Helpers / introspection                                                      #
# --------------------------------------------------------------------------- #
def _read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if not isinstance(data, dict):
        raise RegistryError(f"{path} must contain a YAML mapping")
    return data


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        yaml.safe_dump(data, fh, sort_keys=False, default_flow_style=False)


def _config_to_yaml_dict(config: SkuConfig) -> dict[str, Any]:
    """Serialize a :class:`SkuConfig` to a plain YAML-safe mapping (stable order).

    ``mode="json"`` turns the ``result_type`` enum into its string value so
    ``yaml.safe_dump`` can write it.
    """
    return config.model_dump(mode="json")


def _sop_stub(sku_id: str) -> dict[str, Any]:
    """Minimal placeholder SOP; real authoring happens out-of-band later."""
    return {
        "sku_id": sku_id,
        "version": 1,
        "capture": {},
        "pass_fail": {"rules": []},
    }


def registered_adapters() -> dict[str, type[ModelAdapter]]:
    """Snapshot of registered adapter ids -> classes (for introspection/tests)."""
    return dict(_ADAPTERS)


def registered_plugins() -> dict[str, type[RulePlugin]]:
    """Snapshot of registered plugin ids -> classes (for introspection/tests)."""
    return dict(_PLUGINS)


__all__ = [
    "SkuRegistry",
    "SkuBundle",
    "RegistryError",
    "BundleExistsError",
    "register_adapter",
    "register_plugin",
    "discover_plugins",
    "registered_adapters",
    "registered_plugins",
]
