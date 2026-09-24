"""Wispbyte-friendly process entry point."""

import runpy
import sys
from pathlib import Path

project_dir = Path(__file__).resolve().parent / "geofs-live-radar-main"
sys.path.insert(0, str(project_dir))
runpy.run_path(str(project_dir / "geofs_live_radar.py"), run_name="__main__")
