"""Tests never touch the real store (server/data/aegis.db) and never start the refresh thread.
A test that needs a file store sets AEGIS_DB itself (see test_live.py)."""
import os

os.environ["AEGIS_DB"] = ":memory:"
os.environ["AEGIS_REFRESH"] = "0"
