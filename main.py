"""Compatibility launcher for hosting environments that expect main.py at the repo root."""

from pathlib import Path
import runpy

project_dir = Path(__file__).resolve().parent / "geofs-live-radar-main"
runpy.run_path(str(project_dir / "geofs_live_radar.py"), run_name="__main__")
