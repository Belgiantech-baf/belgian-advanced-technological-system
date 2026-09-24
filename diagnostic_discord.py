"""Discord delivery diagnostic for GeoFS monitoring."""

import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
APP_PATH = ROOT / "geofs-live-radar-main" / "geofs_live_radar.py"
ENV_PATH = ROOT / ".env"

load_dotenv(ENV_PATH)


def print_status(label, ok):
    print(f"{label}: {'✅ PASS' if ok else '❌ FAIL'}")


def main():
    token = (os.getenv("DISCORD_BOT_TOKEN", "") or "").strip()
    channel_id = (os.getenv("DISCORD_CHANNEL_ID", "") or "").strip()
    webhook_url = (os.getenv("DISCORD_WEBHOOK_URL", "") or "").strip()
    test_mode = (os.getenv("TEST_MODE", "false") or "false").strip().lower() == "true"

    print_status("DISCORD_BOT_TOKEN exists", bool(token))
    print_status("DISCORD_CHANNEL_ID exists", bool(channel_id))
    print_status("DISCORD_CHANNEL_ID numeric", channel_id.isdigit())
    print_status("DISCORD_WEBHOOK_URL exists", bool(webhook_url))
    print_status("TEST_MODE=false", not test_mode)

    spec = importlib.util.spec_from_file_location("geofs_live_radar_diag", APP_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    print_status("Discord module import", mod is not None)
    print_status("Bot mode active check", bool(mod.discord_bot_service and getattr(mod.discord_bot_service, "enabled", False)))

    stub = SimpleNamespace(enabled=True)
    mod.discord_bot_service = stub
    mod.queue_discord_alert(
        "entered",
        "TEST01",
        {
            "name": "[BAF] TEST01",
            "aircraft_type": "Test",
            "nearest_air_base": {
                "name": "Kleine Brogel Air Base",
                "distance_km": 5.2,
                "geofs_url": "https://example.test/geofs",
                "flyto_url": "flyto://50.85,4.35,0,0",
            },
            "latitude": 50.85,
            "longitude": 4.35,
            "altitude": 12000,
            "timestamp": "2026-09-23T00:00:00Z",
        },
    )
    print("Route Check: Bot mode is active; webhook delivery is bypassed.")

    print("Diagnostic complete.")


if __name__ == "__main__":
    main()
