"""Simulated EVA suit: Moon and Mars walks, a planted emergency, and a storm abort.

engine.py   one deterministic sim and the alert rules, both driven by catalog/eva.yaml
api.py      GET /api/eva/sites, GET /api/eva/sim, POST /api/eva/assess
plugin.py   after_build writes server/out/eva/{moon,mars}_traverse_storm.json

No schema and no adapter. Nothing here is a real astronaut. See docs/backend/EVA-API.md.
"""
