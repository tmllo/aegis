"""After every build: write server/out/cabin_catalog.json from the catalog and say if it equals Emile's file.

Called by server/build.py (and so at API startup). Never fails the build: drift is caught by
server/tests/test_cabin_catalog.py.
"""
from __future__ import annotations

import json


def after_build(cat, store) -> None:
    from ..build import diff
    from ..views.cabin_catalog import APP_SAMPLE, cabin_catalog, write

    path = write(cat)
    d = diff(cabin_catalog(cat), json.loads(APP_SAMPLE.read_text(encoding="utf-8")))
    print(f"{path.name}: {'identical to the app file' if not d else f'{len(d)} differences'}")
    for line in d[:15]:
        print("   ", line)
