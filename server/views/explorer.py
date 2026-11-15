"""A view of the data core itself: runs the build and writes one self-contained HTML page that shows
every layer with its real contents (catalog entries, store counts, sample rows, engine output, files).

    python -m server.views.explorer          # writes server/out/explorer.html
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from ..build import APP_DATA, OUT, build, diff, strip_generated

TEMPLATE = Path(__file__).with_name("explorer_template.html")


def snapshot() -> dict:
    cat, store, files = build()
    db = store.db
    q = lambda sql: [dict(r) for r in db.execute(sql)]
    obs_by_source = q("SELECT source, quality, COUNT(*) n, COUNT(DISTINCT subject) subjects, COUNT(DISTINCT metric) metrics FROM observation GROUP BY source, quality")
    samples = {}
    for s in ("sim_crew", "osdr", "isslive"):
        samples[s] = [o.__dict__ for o in store.observations(source=s)[:4]]
    samples["sim_crew"] = [o.__dict__ for o in store.observations(subject="c1", metric="vital.bp_sys")[-4:]]
    iss = [o.__dict__ for o in store.observations(subject="iss")]
    events = q("SELECT type, COUNT(*) n FROM event GROUP BY type")
    ev_samples = [e.__dict__ for e in store.events("flare", since="2024-05-08")[:3]] + [e.__dict__ for e in store.events("sep", since=None)[:2]]
    links = q("SELECT relation, COUNT(*) n FROM event_link GROUP BY relation")
    fc = q("SELECT split, level, COUNT(*) n FROM forecast GROUP BY split, level")
    assess = [a.__dict__ for a in store.assessments()]
    files_out = []
    for name, doc in files.items():
        cur = json.loads((APP_DATA / name).read_text(encoding="utf-8"))
        files_out.append({"name": name, "identical": not diff(strip_generated(doc), strip_generated(cur)),
                          "bytes": len(json.dumps(doc)), "top_keys": list(doc.keys())})
    kinds = Counter(m["kind"] for m in cat.metrics.values())
    return {
        "catalog": {
            "metrics": [{k: m.get(k) for k in ("key", "contract_key", "label", "unit", "kind", "hazard", "body_region")}
                        | {"rule": m["rule"]["type"], "rule_detail": m["rule"]} for m in cat.metrics.values()],
            "metric_kinds": dict(kinds),
            "subjects": list(cat.subjects.values()),
            "sources": list(cat.sources.values()),
            "mission": cat.mission,
            "models": [{k: v for k, v in m.items() if k != "feature_importance"} for m in cat.models.values()],
        },
        "runs": store.runs(),
        "obs_by_source": obs_by_source,
        "obs_samples": samples,
        "iss": iss,
        "events": events, "event_samples": ev_samples, "links": links, "forecasts": fc,
        "assessments": assess,
        "files": files_out,
        "totals": {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                   for t in ("observation", "event", "event_link", "forecast", "assessment", "run")},
    }


def main() -> None:
    data = json.dumps(snapshot(), ensure_ascii=False, default=str).replace("</", "<\\/")
    OUT.mkdir(exist_ok=True)
    out = OUT / "explorer.html"
    out.write_text(TEMPLATE.read_text(encoding="utf-8").replace("/*__DATA__*/null", data), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
