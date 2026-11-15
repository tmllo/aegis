"""See the live ISS cabin feed now.

    pip install lightstreamer-client-lib
    python server/probes/iss_cabin_probe.py            # listen for 60 s
    python server/probes/iss_cabin_probe.py --seconds 20 --save cabin.json

Connects to NASA's public ISS Live! telemetry (Lightstreamer demo server, adapter set ISSLIVE),
prints each cabin item with its value and how old it is, and can save the readings as JSON.
Units: the official dictionary says PSIA/PSI/CNT, but observed values are mmHg and degrees C
(docs/research/2-data-sources/01-realtime-data-apis.md, section 1.2).
"""
from __future__ import annotations

import argparse
import json
import threading
import time
from datetime import datetime, timedelta, timezone

from lightstreamer.client import LightstreamerClient, Subscription, SubscriptionListener

ITEMS = {
    "USLAB000058": ("cabin.pressure", "Cabin pressure (US Lab)", "mmHg"),
    "USLAB000059": ("cabin.temp", "Cabin temperature (US Lab)", "degC"),
    "USLAB000053": ("cabin.ppo2", "ppO2 (US Lab)", "mmHg"),
    "USLAB000055": ("cabin.ppco2", "ppCO2 (US Lab)", "mmHg"),
    "NODE3000001": ("cabin.ppo2_node3", "ppO2 (Node 3)", "mmHg"),
    "NODE3000003": ("cabin.ppco2_node3", "ppCO2 (Node 3)", "mmHg"),
    "NODE3000005": ("cabin.urine_tank", "Urine tank", "%"),
    "NODE3000008": ("cabin.waste_water", "Waste water tank", "%"),
    "NODE3000009": ("cabin.water_clean", "Clean water tank", "%"),
    "TIME_000001": ("link.station_time", "Station time / signal", ""),
}
FIELDS = ["Value", "TimeStamp", "Status.Class", "CalibratedData"]


def iss_time(ts: str | None, year: int) -> datetime | None:
    """TimeStamp = day-of-year * 24 + UTC hours (observed 2026-11-14)."""
    try:
        hours = float(ts)
    except (TypeError, ValueError):
        return None
    return datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(hours=hours - 24)


class Listener(SubscriptionListener):
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}
        self.lock = threading.Lock()

    def onItemUpdate(self, update) -> None:  # noqa: N802 (SDK name)
        item = update.getItemName()
        key, label, unit = ITEMS.get(item, (item, item, ""))
        now = datetime.now(timezone.utc)
        t = iss_time(update.getValue("TimeStamp"), now.year)
        row = {
            "item": item,
            "metric": key,
            "label": label,
            "value": update.getValue("CalibratedData"),
            "unit": unit,
            "t": t.isoformat() if t else None,
            "age_h": round((now - t).total_seconds() / 3600, 1) if t else None,
            "signal": update.getValue("Status.Class") == "24" if item == "TIME_000001" else None,
        }
        with self.lock:
            self.rows[item] = row
        age = f"{row['age_h']} h old" if row["age_h"] is not None else "age unknown"
        print(f"{label:<28} {row['value']:>10} {unit:<5} {age}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--save", help="write the readings to this JSON file")
    args = ap.parse_args()

    listener = Listener()
    sub = Subscription("MERGE", list(ITEMS), FIELDS)
    sub.setRequestedSnapshot("yes")
    sub.addListener(listener)
    client = LightstreamerClient("https://push.lightstreamer.com", "ISSLIVE")
    client.subscribe(sub)
    client.connect()
    print(f"Listening to ISS Live! for {args.seconds} s ...", flush=True)
    try:
        time.sleep(args.seconds)
    finally:
        client.unsubscribe(sub)
        client.disconnect()

    with listener.lock:
        rows = list(listener.rows.values())
    print(f"\n{len(rows)} of {len(ITEMS)} items received.")
    if args.save:
        out = {"source": "isslive", "server": "https://push.lightstreamer.com", "adapter_set": "ISSLIVE",
               "fetched_at": datetime.now(timezone.utc).isoformat(), "rows": rows}
        with open(args.save, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        print(f"Saved to {args.save}")


if __name__ == "__main__":
    main()
