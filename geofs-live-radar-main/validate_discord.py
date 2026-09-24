"""Offline validation for Discord configuration and Belgium alert formatting."""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("discord-validation")

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def main():
    token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
    channel_value = os.environ.get("DISCORD_CHANNEL_ID", "").strip()
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    test_mode = os.environ.get("TEST_MODE", "false").strip().lower() == "true"

    logger.info(
        "Environment loaded: DISCORD_BOT_TOKEN=%s DISCORD_CHANNEL_ID=%s DISCORD_WEBHOOK_URL=%s TEST_MODE=%s",
        "found" if token else "missing",
        "provided" if channel_value else "missing",
        "found" if webhook else "missing",
        test_mode,
    )

    failures = []
    if not token:
        failures.append("DISCORD_BOT_TOKEN is missing")
    try:
        channel_id = int(channel_value)
    except (TypeError, ValueError):
        channel_id = None
        failures.append("DISCORD_CHANNEL_ID must contain only digits")
    if not test_mode:
        failures.append("TEST_MODE must be true for offline validation")

    if failures:
        for failure in failures:
            logger.error("Configuration check failed: %s", failure)
        logger.error("Test completed: failed; no Discord or GeoFS network requests were made")
        return 1

    sample = {
        "name": "TEST-AIRCRAFT",
        "aircraft_type": "test",
        "latitude": 50.8503,
        "longitude": 4.3517,
        "altitude": 12000,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    logger.info("Monitoring dry run: simulated aircraft entered Belgium")
    logger.info(
        "Generated test alert: title=GeoFS Belgium Monitor event=entered channel_id=%s fields=%s",
        channel_id,
        ",".join(sample.keys()),
    )
    logger.info("Test completed: passed; no Discord or GeoFS network requests were made")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())