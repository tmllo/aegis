"""
Build the modelling flare table. Decisions already made:

- Main label, sep_linked_goes10: DONKI links the flare to a GOES >10 MeV SEP.
  GOES >100 MeV, SOHO, STEREO, ACE, and REleASE model alerts do not count.
- Sensitivity check, sep_within_72h_goes10: any GOES >10 MeV onset in
  (peak, peak + 72h].
- Keep M-class and X-class only. C, B, and A logging is inconsistent across years.
- Store the 2013-10-28 X1.0 location as N07W65. Keep longitudes past 90°.
- Drop a flare when a GOES >10 MeV onset falls in (peak - 48h, peak].

Writes data/processed/flares_model.csv. Does not assign a split (that is D2)
and does not train a model.

    python ml/prepare_model_flares.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed" / "flares_model.csv"
HOUR_NS = 3_600_000_000_000
FIX_ID = "2013-10-28T01:41:00-FLR-001"

# Inclusive year bounds. None means open. Test always starts in 2024 so the
# May 2024 replay stays held out. Printed only; not written to the csv.
SPLIT_OPTIONS = (
    ("A", "train ≤2021, val 2022–2023, test 2024–now", (None, 2021), (2022, 2023), (2024, None)),
    ("B", "train ≤2022, val 2023, test 2024–now", (None, 2022), (2023, 2023), (2024, None)),
    ("C", "train ≤2019, val 2020–2023, test 2024–now", (None, 2019), (2020, 2023), (2024, None)),
)


def classify_instrument(name: str) -> str:
    u = (name or "").upper()
    if "MODEL" in u or "RELEASE" in u:
        return "model"
    if "STEREO" in u:
        return "stereo"
    if "GOES" in u and ">100" in u:
        return "goes_gt100"
    if "GOES" in u and ">10" in u:
        return "goes_gt10"
    if "SOHO" in u:
        return "soho"
    if "ACE" in u:
        return "ace"
    return "other"


def load_seps() -> pd.DataFrame:
    rows = []
    for path in sorted(RAW.glob("SEP_*.json")):
        for rec in json.loads(path.read_text(encoding="utf-8")) or []:
            names = [i.get("displayName", "") for i in (rec.get("instruments") or [])]
            kinds = [classify_instrument(n) for n in names] or ["other"]
            kind = "goes_gt10" if "goes_gt10" in kinds else kinds[0]
            rows.append({"sep_id": rec.get("sepID"), "kind": kind, "event_time": rec.get("eventTime")})
    seps = pd.DataFrame(rows).drop_duplicates("sep_id")
    seps["event_time"] = pd.to_datetime(seps["event_time"], utc=True)
    return seps


def fix_location(flares: pd.DataFrame) -> pd.DataFrame:
    flares = flares.copy()
    hit = flares.flare_id == FIX_ID
    if int(hit.sum()) != 1:
        raise RuntimeError(f"expected one row for {FIX_ID}, found {int(hit.sum())}")
    raw = str(flares.loc[hit, "source_location"].iloc[0]).upper().replace(" ", "")
    if raw not in ("N07W634", "N07W65"):
        raise RuntimeError(f"{FIX_ID} location is {raw}, not the known typo or the fix")
    flares.loc[hit, "source_location"] = "N07W65"
    flares.loc[hit, "latitude_deg"] = 7
    flares.loc[hit, "longitude_deg"] = 65
    return flares


def ids_of(cell: str, allowed: set[str]) -> list[str]:
    return [i for i in str(cell or "").split(";") if i in allowed]


def first_onset(peaks: pd.Series, starts: np.ndarray, hours: int) -> pd.Series:
    """Earliest onset in (peak, peak + hours]."""
    starts = np.sort(starts.astype("int64"))
    out = []
    for pt in peaks:
        if pd.isna(pt) or len(starts) == 0:
            out.append(pd.NaT)
            continue
        hit = starts[(starts > pt.value) & (starts <= pt.value + hours * HOUR_NS)]
        out.append(pd.Timestamp(int(hit[0]), unit="ns", tz="UTC") if len(hit) else pd.NaT)
    return pd.Series(out, index=peaks.index)


def onset_in_prior(peaks: pd.Series, starts: np.ndarray, hours: int = 48) -> pd.Series:
    """True when any onset falls in (peak - hours, peak]."""
    starts = np.sort(starts.astype("int64"))
    out = []
    for pt in peaks:
        if pd.isna(pt) or len(starts) == 0:
            out.append(False)
            continue
        lo, hi = pt.value - hours * HOUR_NS, pt.value
        out.append(bool(((starts > lo) & (starts <= hi)).any()))
    return pd.Series(out, index=peaks.index)


def add_labels(flares: pd.DataFrame, goes: pd.DataFrame) -> pd.DataFrame:
    flares = flares.copy()
    goes_ids = set(goes.sep_id)
    onset = dict(zip(goes.sep_id, goes.event_time))
    linked = flares.linked_sep_ids.map(lambda cell: ids_of(cell, goes_ids))
    flares["linked_goes10_ids"] = linked.map(lambda ids: ";".join(ids))
    flares["sep_linked_goes10"] = linked.map(bool)
    flares["linked_goes10_onset"] = linked.map(
        lambda ids: min((onset[i] for i in ids if pd.notna(onset[i])), default=pd.NaT)
    )
    starts = goes.event_time.dropna().astype("int64").to_numpy()
    flares["goes10_onset_within_72h"] = first_onset(flares.peak_time, starts, 72)
    flares["sep_within_72h_goes10"] = flares["goes10_onset_within_72h"].notna()
    flares["goes10_in_prior_48h"] = onset_in_prior(flares.peak_time, starts, 48)
    return flares


def count_line(frame: pd.DataFrame) -> str:
    n = len(frame)
    linked = int(frame.sep_linked_goes10.sum())
    window = int(frame.sep_within_72h_goes10.sum())
    rate = linked / n if n else 0
    return f"{n} flares, {linked} linked positives ({rate:.1%}), {window} within-72h positives"


def in_years(year: pd.Series, lo, hi) -> pd.Series:
    ok = pd.Series(True, index=year.index)
    if lo is not None:
        ok &= year >= lo
    if hi is not None:
        ok &= year <= hi
    return ok


def storms(frame: pd.DataFrame) -> int:
    ids = set()
    for cell in frame.loc[frame.sep_linked_goes10, "linked_goes10_ids"]:
        ids.update(i for i in str(cell).split(";") if i)
    return len(ids)


def print_splits(model: pd.DataFrame) -> None:
    year = model.peak_time.dt.year
    print("\n=== POSITIVES BY YEAR (modelling set, split not chosen) ===")
    by = model.groupby(year).agg(
        flares=("flare_id", "size"),
        linked=("sep_linked_goes10", "sum"),
        window=("sep_within_72h_goes10", "sum"),
    )
    print(by.to_string())
    print("\n=== D2 OPTIONS (not written) ===")
    for key, title, train, val, test in SPLIT_OPTIONS:
        print(f"\n{key}. {title}")
        for name, bounds in (("train", train), ("val", val), ("test", test)):
            part = model.loc[in_years(year, *bounds)]
            print(
                f"  {name:5} {count_line(part)}, {storms(part)} distinct linked GOES >10 events"
            )


def main() -> None:
    flares = pd.read_csv(ROOT / "data" / "processed" / "flares.csv")
    flares["peak_time"] = pd.to_datetime(flares["peak_time"], utc=True)
    flares = fix_location(flares)

    seps = load_seps()
    print("SEP rows by instrument kind:")
    print(seps.kind.value_counts().to_string())
    other = sorted(seps.loc[seps.kind == "other", "sep_id"])
    if other:
        raise RuntimeError(f"unclassified SEP instruments: {other[:5]}")

    goes = seps[seps.kind == "goes_gt10"]
    labeled = add_labels(flares, goes)
    mx = labeled[labeled.class_letter.isin(["M", "X"])].copy()
    print("\n(a) M-class and above, before the prior-storm drop:")
    print("   ", count_line(mx))
    print("    by class:")
    for letter, part in mx.groupby("class_letter"):
        print(f"      {letter}  {count_line(part)}")

    drop = mx[mx.goes10_in_prior_48h]
    model = mx[~mx.goes10_in_prior_48h].sort_values("peak_time").reset_index(drop=True)
    print("\n(c) dropped for a GOES >10 MeV onset in the prior 48h:")
    print("   ", count_line(drop))
    print("\nModelling set after (a) and (c):")
    print("   ", count_line(model))

    fixed = model.loc[model.flare_id == FIX_ID]
    if len(fixed):
        row = fixed.iloc[0]
        print(f"\nFixed flare kept: {row.flare_class} at {row.source_location} ({row.longitude_deg:.0f}°)")
    else:
        print(f"\nFixed flare {FIX_ID} is not in the modelling set (dropped or filtered).")
    over = model.longitude_deg.abs() > 90
    print(f"Over-limb flares kept (|longitude| > 90°): {int(over.sum())}")
    if (model.longitude_deg.abs() > 180).any():
        raise RuntimeError("a longitude past 180° is still in the modelling set")
    if (model.loc[model.flare_id == FIX_ID, "source_location"] == "N07W634").any():
        raise RuntimeError("typo location survived")

    may = (model.peak_time >= "2024-05-01") & (model.peak_time < "2024-06-01")
    may_drop = (drop.peak_time >= "2024-05-01") & (drop.peak_time < "2024-06-01")
    print("\nMay 2024, M and X only:")
    print("   kept   ", count_line(model.loc[may]))
    print("   dropped", count_line(drop.loc[may_drop]))

    keep = [
        "flare_id", "begin_time", "peak_time", "end_time", "flare_class", "class_letter",
        "class_flux", "source_location", "latitude_deg", "longitude_deg", "active_region",
        "linked_cme_ids", "has_linked_cme", "cme_speed_kms", "cme_half_angle_deg",
        "linked_goes10_ids", "sep_linked_goes10", "linked_goes10_onset",
        "sep_within_72h_goes10", "goes10_onset_within_72h",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    model[keep].to_csv(OUT, index=False)
    print(f"\nWrote {OUT}")
    print_splits(model)


if __name__ == "__main__":
    main()
