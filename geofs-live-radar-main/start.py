"""Wispbyte-friendly process entry point."""

import runpy
from pathlib import Path


runpy.run_path(str(Path(__file__).with_name("geofs_live_radar.py")), run_name="__main__")