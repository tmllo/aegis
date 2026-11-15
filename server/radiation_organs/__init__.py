"""Organ dose, cancer-risk share, the shielding path, and the forecast explainer.

engine.py   pure functions over the catalog and the forecast document
api.py      /api/radiation/organs, /compare, /path, /api/forecast/explain
export.py   python -m server.radiation_organs.export writes the offline snapshot

No tables and no adapter. Doses are published phantom results, not astronaut records.
See docs/backend/RADIATION-ORGAN-DATA.md and docs/backend/RADIATION-ORGANS-API.md.
"""
