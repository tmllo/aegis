"""Forecast issue time for each development flare.

Issue time is the later of the flare peak and the start time of the linked CME
(the latest one when a flare has several, because cme_speed_kms is the max over
all linked CMEs and is only known once every one of them has been seen). A flare
with no linked CME is issued at its peak.

Only CMEs linked to the flares passed in are kept, so passing development flares
never brings a 2024+ row into use.

Caveat: a CME's start time is its first coronagraph frame. The speed used as a
feature is measured later, so even this issue time is a little early.
"""
from __future__ import annotations

import pandas as pd

from devset import ROOT

CME_CSV = ROOT / "data" / "processed" / "cmes.csv"


def _ids(cell) -> list[str]:
    return [i for i in str(cell if isinstance(cell, str) else "").split(";") if i]


def add_issue_time(flares: pd.DataFrame) -> pd.DataFrame:
    out = flares.copy()
    wanted = {i for cell in out["linked_cme_ids"] for i in _ids(cell)}
    cmes = pd.read_csv(CME_CSV, usecols=["cme_id", "start_time"])
    cmes = cmes[cmes["cme_id"].isin(wanted)]
    start = dict(zip(cmes["cme_id"], pd.to_datetime(cmes["start_time"], utc=True)))
    last = out["linked_cme_ids"].map(
        lambda c: max((start[i] for i in _ids(c) if i in start), default=pd.NaT)
    )
    out["cme_last_start"] = pd.to_datetime(last, utc=True)
    peak = pd.to_datetime(out["peak_time"], utc=True)
    out["issue_time"] = peak.where(out["cme_last_start"].isna() | (out["cme_last_start"] < peak),
                                   out["cme_last_start"])
    return out


def lead_hours(issue: pd.Series, onset: pd.Series) -> pd.Series:
    onset = pd.to_datetime(onset, utc=True, errors="coerce")
    return (onset - pd.to_datetime(issue, utc=True)).dt.total_seconds() / 3600


def event_lead_times(pred: pd.DataFrame, threshold: float) -> dict:
    """One lead time per storm (distinct linked GOES >10 MeV SEP): from the
    earliest issue time among its flares at or above the threshold to its onset.
    pred needs y, p, issue_time, linked_goes10_ids, linked_goes10_onset."""
    rows = []
    pos = pred[pred["y"] == 1]
    for _, r in pos.iterrows():
        for sep in _ids(r["linked_goes10_ids"]):
            rows.append({"sep": sep, "p": r["p"], "issue": r["issue_time"],
                         "onset": r["linked_goes10_onset"]})
    ev = pd.DataFrame(rows)
    ev["issue"] = pd.to_datetime(ev["issue"], utc=True)
    hit = ev[ev["p"] >= threshold]
    first = hit.groupby("sep").agg(issue=("issue", "min"), onset=("onset", "min"))
    hours = lead_hours(first["issue"], first["onset"]).dropna()
    n_events = ev["sep"].nunique()
    return {
        "events": int(n_events),
        "events_caught": int(len(first)),
        "event_hit_rate": len(first) / n_events if n_events else None,
        "median_event_lead_time_h": None if hours.empty else round(float(hours.median()), 2),
        "negative_event_lead_times": int((hours < 0).sum()),
    }
