# BOC v4

BOC v4 is a complete ground-up rebuild of the BAF Operations Client as a first-class BATS module. It is designed as a modern GeoFS-aware operational dashboard and communication layer without preserving the legacy userscript architecture.

## Included modules

- BOC.Core
- BOC.UI
- BOC.Chat
- BOC.Operations
- BOC.Network
- BOC.Pilots
- BOC.Alerts
- BOC.Settings
- BOC.Storage
- BOC.Diagnostics
- BOC.Adapter.GeoFS
- BOC.Adapter.BATS

## Goals

- BATS communications layer
- BATS operational dashboard
- BATS pilot awareness system
- BATS mission management system
- BATS moderation utilities
- BAF operations environment
- read-only GeoFS integration
- localStorage + IndexedDB persistence
- modular, dockable, draggable, resizable UI

## Run locally

From this directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Notes

This implementation is intentionally a clean “platform first” foundation with a static UI shell, storage adapters, and BATS/GeoFS integration hooks. It is designed to be extended with a real browser-integrated GeoFS client without overriding simulator internals.
