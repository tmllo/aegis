"""
Pull NASA DONKI space-weather events (flares, CMEs, SEP radiation storms) and
build one flat table of flares with features and candidate labels.

Usage:
    pip install requests pandas
    python ml/fetch_donki.py --start 2010-01-01 --end 2026-11-14

Outputs:
    data/raw/<TYPE>_<start>_<end>.json   cached API responses (re-runs skip these)
    data/processed/flares.csv            one row per flare: features + candidate labels
    data/processed/cmes.csv
    data/processed/seps.csv

Two candidate labels are written so YOU can choose (see ml/CLAUDE.md, decision D1):
    sep_linked      DONKI analysts linked this flare to an SEP event (causal, curated)
    sep_within_24h / sep_within_72h
                    any SEP onset in (peak_time, peak_time + H] (time window, noisier:
                    can catch storms caused by a different flare)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests

PRIMARY = "https://ccmc.gsfc.nasa.gov/DONKI-API/get/{etype}"
FALLBACK = "https://api.nasa.gov/DONKI/{etype}"  # needs api_key (DEMO_KEY is rate-limited)
CHUNK_DAYS = 30
CLASS_FLUX = {"A": 1e-8, "B": 1e-7, "C": 1e-6, "M": 1e-5, "X": 1e-4}
ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------- fetching
def _get(etype: str, start: str, end: str) -> list:
    params = {"startDate": start, "endDate": end}
    errors = []
    for attempt in range(3):
        for base, extra in ((PRIMARY, {}), (FALLBACK, {"api_key": os.getenv("NASA_API_KEY", "DEMO_KEY")})):
            try:
                r = requests.get(base.format(etype=etype), params={**params, **extra}, timeout=60)
                if r.status_code == 200:
                    txt = r.text.strip()
                    return json.loads(txt) if txt else []
                errors.append(f"{base} -> HTTP {r.status_code}")
            except (requests.RequestException, json.JSONDecodeError) as e:
                errors.append(f"{base} -> {e}")
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Failed {etype} {start}..{end}: {errors[-2:]}")


def fetch_all(etype: str, start: date, end: date, raw_dir: Path) -> list:
    out, cur = [], start
    while cur <= end:
        stop = min(cur + timedelta(days=CHUNK_DAYS - 1), end)
        f = raw_dir / f"{etype}_{cur}_{stop}.json"
        if f.exists():
            data = json.loads(f.read_text())
        else:
            data = _get(etype, str(cur), str(stop))
            f.write_text(json.dumps(data))
            time.sleep(0.5)  # be polite to NASA
        out.extend(data or [])
        print(f"  {etype} {cur}..{stop}: {len(data or [])}", flush=True)
        cur = stop + timedelta(days=1)
    return out


# ---------------------------------------------------------------- parsing
def parse_class(cls):
    """'M6.6' -> ('M', 6.6e-5). Returns (None, None) if unparseable."""
    if not cls or not isinstance(cls, str):
        return None, None
    m = re.match(r"^\s*([ABCMX])\s*([0-9]*\.?[0-9]+)?", cls.upper())
    if not m:
        return None, None
    letter, num = m.group(1), float(m.group(2) or 1.0)
    return letter, CLASS_FLUX[letter] * num


def parse_location(loc):
    """'S22W80' -> (-22, 80). West positive, East negative. (None, None) if unknown."""
    if not loc or not isinstance(loc, str):
        return None, None
    m = re.search(r"([NS])\s*(\d{1,2})\s*([EW])\s*(\d{1,3})", loc.upper())
    if not m:
        return None, None
    lat = int(m.group(2)) * (1 if m.group(1) == "N" else -1)
    lon = int(m.group(4)) * (1 if m.group(3) == "W" else -1)
    return lat, lon


def ts(s):
    if not s:
        return pd.NaT
    return pd.to_datetime(s, utc=True, errors="coerce")


def linked_ids(rec) -> list[str]:
    return [e.get("activityID") for e in (rec.get("linkedEvents") or []) if e.get("activityID")]


def cme_best_analysis(cme: dict) -> dict:
    an = cme.get("cmeAnalyses") or []
    if not an:
        return {}
    best = [a for a in an if a.get("isMostAccurate")] or an
    return best[0]


# ---------------------------------------------------------------- tables
def build_tables(flr: list, cme: list, sep: list):
    # SEPs
    sep_rows = []
    for s in sep:
        sep_rows.append({
            "sep_id": s.get("sepID"),
            "event_time": ts(s.get("eventTime")),
            "linked": ";".join(linked_ids(s)),
        })
    seps = pd.DataFrame(sep_rows, columns=["sep_id", "event_time", "linked"])
    seps = seps.drop_duplicates("sep_id").sort_values("event_time").reset_index(drop=True)
    sep_time = dict(zip(seps.sep_id, seps.event_time))

    # CMEs
    cme_rows = []
    for c in cme:
        a = cme_best_analysis(c)
        cme_rows.append({
            "cme_id": c.get("activityID"),
            "start_time": ts(c.get("startTime")),
            "source_location": c.get("sourceLocation"),
            "speed_kms": a.get("speed"),
            "half_angle_deg": a.get("halfAngle"),
            "cme_type": a.get("type"),
            "linked": ";".join(linked_ids(c)),
        })
    cmes = pd.DataFrame(cme_rows, columns=["cme_id", "start_time", "source_location", "speed_kms",
                                           "half_angle_deg", "cme_type", "linked"])
    cmes = cmes.drop_duplicates("cme_id").reset_index(drop=True)
    cme_speed = dict(zip(cmes.cme_id, cmes.speed_kms))
    cme_half = dict(zip(cmes.cme_id, cmes.half_angle_deg))

    # reverse links: anything that points at a flare
    rev = {}
    for _, row in pd.concat([seps.rename(columns={"sep_id": "id"})[["id", "linked"]],
                             cmes.rename(columns={"cme_id": "id"})[["id", "linked"]]]).iterrows():
        for target in filter(None, (row["linked"] or "").split(";")):
            rev.setdefault(target, set()).add(row["id"])

    # Flares
    rows = []
    for f in flr:
        fid = f.get("flrID")
        letter, flux = parse_class(f.get("classType"))
        lat, lon = parse_location(f.get("sourceLocation"))
        links = set(linked_ids(f)) | rev.get(fid, set())
        cme_ids = sorted(i for i in links if "CME" in i)
        sep_ids = sorted(i for i in links if "SEP" in i)
        speeds = [cme_speed.get(i) for i in cme_ids if pd.notna(cme_speed.get(i))]
        halves = [cme_half.get(i) for i in cme_ids if pd.notna(cme_half.get(i))]
        linked_sep_times = [sep_time[i] for i in sep_ids if i in sep_time and pd.notna(sep_time[i])]
        rows.append({
            "flare_id": fid,
            "begin_time": ts(f.get("beginTime")),
            "peak_time": ts(f.get("peakTime")) if f.get("peakTime") else ts(f.get("beginTime")),
            "end_time": ts(f.get("endTime")),
            "flare_class": f.get("classType"),
            "class_letter": letter,
            "class_flux": flux,
            "source_location": f.get("sourceLocation"),
            "latitude_deg": lat,
            "longitude_deg": lon,
            "active_region": f.get("activeRegionNum"),
            "linked_cme_ids": ";".join(cme_ids),
            "linked_sep_ids": ";".join(sep_ids),
            "has_linked_cme": bool(cme_ids),
            "cme_speed_kms": max(speeds) if speeds else None,
            "cme_half_angle_deg": max(halves) if halves else None,
            "sep_linked": bool(sep_ids),
            "linked_sep_onset": min(linked_sep_times) if linked_sep_times else pd.NaT,
        })
    flares = pd.DataFrame(rows).drop_duplicates("flare_id").sort_values("peak_time").reset_index(drop=True)

    # time-window labels (any SEP onset after the flare peak within H hours)
    # compare as integer nanoseconds (robust to tz/resolution differences)
    st = np.array(sorted(t.value for t in seps.event_time.dropna()), dtype="int64")
    H = 3_600_000_000_000  # 1 hour in ns
    for h in (24, 72):
        onset = []
        for pt in flares.peak_time:
            if pd.isna(pt):
                onset.append(pd.NaT)
                continue
            lo, hi = pt.value, pt.value + h * H
            hit = st[(st > lo) & (st <= hi)]
            onset.append(pd.Timestamp(int(hit[0]), unit="ns", tz="UTC") if len(hit) else pd.NaT)
        flares[f"sep_onset_within_{h}h"] = onset
        flares[f"sep_within_{h}h"] = flares[f"sep_onset_within_{h}h"].notna()

    # convenience: was an SEP already in progress (onset in the 48h before peak)? useful to filter/flag
    prev = []
    for pt in flares.peak_time:
        if pd.isna(pt):
            prev.append(False)
            continue
        lo, hi = pt.value - 48 * H, pt.value
        prev.append(bool(((st > lo) & (st <= hi)).any()))
    flares["sep_in_prior_48h"] = prev
    return flares, cmes, seps


def summarize(flares: pd.DataFrame, seps: pd.DataFrame):
    print("\n=== SUMMARY ===")
    print(f"flares: {len(flares)}  |  SEP events: {len(seps)}")
    if len(flares):
        print(f"date range: {flares.peak_time.min()} -> {flares.peak_time.max()}")
        print("flares by class:", flares.class_letter.value_counts(dropna=False).to_dict())
        for col in ("sep_linked", "sep_within_24h", "sep_within_72h"):
            print(f"{col:>16}: {int(flares[col].sum())} positives ({flares[col].mean():.2%})")
        print("missing longitude:", int(flares.longitude_deg.isna().sum()))
        print("\nSEP rate (sep_linked) by class:")
        print(flares.groupby("class_letter")["sep_linked"].agg(["count", "mean"]).round(3))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2010-01-01")
    ap.add_argument("--end", default=str(date.today()))
    ap.add_argument("--from-raw", action="store_true", help="only rebuild tables from cached raw files")
    args = ap.parse_args()

    raw_dir, out_dir = ROOT / "data" / "raw", ROOT / "data" / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)

    data = {}
    for etype in ("FLR", "CME", "SEP"):
        if args.from_raw:
            data[etype] = [r for f in sorted(raw_dir.glob(f"{etype}_*.json")) for r in (json.loads(f.read_text()) or [])]
        else:
            print(f"Fetching {etype} ...")
            data[etype] = fetch_all(etype, start, end, raw_dir)

    flares, cmes, seps = build_tables(data["FLR"], data["CME"], data["SEP"])
    flares.to_csv(out_dir / "flares.csv", index=False)
    cmes.to_csv(out_dir / "cmes.csv", index=False)
    seps.to_csv(out_dir / "seps.csv", index=False)
    summarize(flares, seps)
    print(f"\nWrote {out_dir}/flares.csv, cmes.csv, seps.csv")


if __name__ == "__main__":
    sys.exit(main())
