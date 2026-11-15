"""Organ dose and the forecast explainer. No I/O. Every constant is in catalog/radiation_organs.yaml.

GCR is the habitat daily effective dose times days times a profile (flat, except the ISS mix).
An SPE is the published phantom table. A storm is background plus the forecast chance times that table.
Effective dose uses ICRP tissue weights, with the remainder weight on the mean of heart, kidney,
pancreas and spleen. Hull and vest effective doses are the papers' totals. Shelter is derived.
"""
from __future__ import annotations

from datetime import datetime, timedelta

QUALITY_DOSE = "estimate"
QUALITY_MODEL = "model"
SHIELDS = ("hull", "vest", "shelter")
EVENTS = ("oct1989", "aug1972")
SCENARIOS = ("gcr", "spe", "storm")


class RadError(ValueError):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


def val(node):
    """A catalog number is {value, source, ...}. Anything else is itself."""
    if isinstance(node, dict) and "value" in node:
        return node["value"]
    return node


def spec_of(cat) -> dict:
    spec = (cat.extra or {}).get("radiation_organs")
    if not spec:
        raise RadError(500, "catalog has no radiation_organs.yaml")
    return spec


def e_day(cat, env: str) -> float:
    try:
        return float(cat.habitat_for_environment(env)["assumed_dose_mSv_day"])
    except (StopIteration, KeyError):
        raise RadError(422, f"env must be one of iss, moon, transit, mars; got {env!r}")


def organs_report(cat, *, subject: str, env: str, scenario: str, event: str, shield: str,
                  days: int, sex: str, p: float | None, career_used_mSv: float,
                  flare: dict | None) -> dict:
    spec = spec_of(cat)
    _check(scenario, event, shield, sex, days)
    rate = e_day(cat, env)
    chance = _chance(p, flare) if scenario == "storm" else 1.0
    built = [_organ_doses(spec, o, env, scenario, event, shield, days, rate, chance) for o in spec["organs"]]
    by_id = {b["id"]: b for b in built}
    bg_e = _effective(spec, {i: b["bg"] for i, b in by_id.items()})
    event_unit = {i: b["event_unit"] for i, b in by_id.items()}
    if scenario == "gcr":
        event_e = 0.0
    elif shield in ("hull", "vest"):
        event_e = float(val(spec["paper_effective_mSv"][event][shield])) * (chance if scenario == "storm" else 1.0)
    else:
        event_e = _effective(spec, event_unit) * (chance if scenario == "storm" else 1.0)
    effective = bg_e + event_e
    shares = _risk_shares(spec, by_id, sex)
    reid = float(val(spec["reid_per_mSv_pct"]))
    rows = []
    for b in built:
        rows.append(_row(spec, b, shares, effective, reid, scenario, days, rate, sex))
    rows.append(_remainder_row(spec, by_id, shares, effective, reid, scenario, chance))
    _heats(rows)
    _strip(rows, spec, event, scenario, chance)
    top = [i for i, _ in sorted(((r["id"], r["share_of_risk"]) for r in rows if r["id"] != "remainder"),
                                key=lambda kv: -kv[1])[:3]]
    career_limit = float(val(spec["limits"]["career_effective_mSv"]))
    used = float(career_used_mSv or 0)
    used_ids = set()
    for row in rows:
        used_ids.update(row["source_ids"])
    used_ids.add("S10")
    if scenario == "gcr":
        used_ids.add("S3")
        if env == "iss":
            used_ids.update(("S4", "S6"))
    else:
        used_ids.update(("S4", "S9"))
    notes = [spec["limit_note"]]
    if shield == "shelter":
        notes.append("Shelter is a HAND-SET estimate: the hull dose times a water-slab factor (S9). "
                     "Behind about 25 g/cm2 the spectrum is already hard, so this probably overstates the benefit.")
    if scenario == "storm":
        notes.append("Expected dose is the forecast chance times an Aug 1972 or Oct 1989 reference storm. "
                     "It shows the stakes. It is not a forecast of how large the storm is.")
    out = {
        "subject": subject, "env": env, "scenario": scenario, "event": event, "shield": shield,
        "days": days, "sex": sex, "quality": QUALITY_DOSE, "organs": rows,
        "totals": {
            "effective_mSv": _r(effective, 1),
            "event_effective_mSv": _r(event_e, 1),
            "bg_effective_mSv": _r(bg_e, 1),
            "reid_pct": round(effective * reid, 3),
            "career_limit_mSv": career_limit,
            "pct_of_career": round((used + effective) / career_limit * 100, 1),
            "career_used_mSv": round(used, 1),
            "top_risk": top,
            "design_ref_limit_mSv": float(val(spec["limits"]["design_ref_spe_mSv"])),
        },
        "forecast": _flare_echo(flare, chance) if scenario == "storm" else None,
        "notes": notes,
        "sources": _sources(spec, used_ids),
    }
    return out


def compare_report(cat, *, subject: str, env: str, event: str, days: int, sex: str,
                   career_used_mSv: float) -> dict:
    """One SPE, three shields. Days are not added to the dose; the level check still adds 30 days."""
    spec = spec_of(cat)
    _check("spe", event, "hull", sex, days)
    rate = e_day(cat, env)
    per_shield = {}
    for shield in SHIELDS:
        per_shield[shield] = organs_report(
            cat, subject=subject, env=env, scenario="spe", event=event, shield=shield,
            days=days, sex=sex, p=None, career_used_mSv=career_used_mSv, flare=None)
    ids = [o["id"] for o in per_shield["hull"]["organs"]]
    organs = []
    for oid in ids:
        dose, pct, level = {}, {}, {}
        for shield in SHIELDS:
            row = next(o for o in per_shield[shield]["organs"] if o["id"] == oid)
            dose[shield] = row["dose_mSv"]
            pct[shield] = row["pct_of_limit"]
            level[shield] = row["level"]
        organs.append({"id": oid, "dose_mSv": dose, "pct_of_limit": pct, "level": level})
    return {
        "subject": subject, "env": env, "event": event, "sex": sex,
        "shields": list(SHIELDS), "organs": organs,
        "totals": {"effective_mSv": {s: per_shield[s]["totals"]["effective_mSv"] for s in SHIELDS}},
        "quality": QUALITY_DOSE,
        "sources": _sources(spec, {"S4", "S9", "S10", "S7", "S8"}),
    }


def path_report(cat, *, scenario: str, event: str, shield: str) -> dict:
    spec = spec_of(cat)
    if scenario not in ("gcr", "spe"):
        raise RadError(422, "path scenario must be gcr or spe")
    _check("spe" if scenario == "spe" else "gcr", event, shield, "f", 1)
    if scenario == "gcr":
        stages, sources, note, kind, spectrum = _gcr_stages(spec)
    elif event == "aug1972":
        stages, sources, note, kind, spectrum = _al_stages(spec, shield)
    else:
        stages, sources, note, kind, spectrum = _water_stages(spec, shield)
    current = {"hull": "orion", "vest": "orion", "shelter": "shelter"}.get(shield, "orion")
    if scenario != "gcr" and event == "oct1989":
        current = "w10" if shield == "shelter" else "w10"
        # Hull and vest sit at Orion thickness, which this water series does not reach.
        # The thickest slab is the 10 cm stage. Shelter uses that same slab.
        if shield == "hull":
            current = "w10"
    if scenario == "gcr":
        current = {"hull": "orion", "vest": "orion", "shelter": "shelter"}[shield]
    return {
        "scenario": scenario, "event": event, "shield": shield, "quality": QUALITY_DOSE,
        "particles": {"kind": kind, "spectrum": spectrum, "note": note},
        "stages": stages,
        "current_stage": current,
        "body_gradient": {
            "skin_to_deep": val(spec["body_gradient"]["skin_to_deep"]),
            "source_id": "S1",
            "note": spec["body_gradient"]["note"],
        },
        "organs_ref": f"/api/radiation/organs?scenario={scenario}&event={event}&shield={shield}",
        "sources": _sources(spec, sources),
    }


def explain_report(cat, forecast: dict | None) -> dict:
    spec = spec_of(cat)
    if not forecast or not forecast.get("events"):
        return {"model": None, "horizon_h": None, "generated_at": None, "now": None,
                "timeline": [], "headline": None, "held_out_storms": [], "feature_importance": [],
                "how_it_works": list(spec["how_it_works"]), "dose_if_storm": None,
                "quality": "unavailable", "sources": _sources(spec, {"DONKI"})}
    meta = forecast["meta"]
    events = forecast["events"]
    newest = max(events, key=lambda e: e["peak_time"])
    metrics = meta["metrics_test"]
    now_t = _parse(newest["peak_time"])
    window = now_t - timedelta(hours=meta["horizon_hours"])
    timeline = [{"t": e["peak_time"], "flare_id": e["flare_id"], "flare_class": e["flare_class"],
                 "p_storm": e["p_storm"], "alert_level": e["alert_level"]}
                for e in sorted(events, key=lambda e: e["peak_time"])
                if window < _parse(e["peak_time"]) <= now_t or e["peak_time"] == newest["peak_time"]]
    groups: dict[str, list] = {}
    for e in events:
        onset = e.get("storm_onset_time")
        if e.get("split") == "test" and onset:
            groups.setdefault(onset, []).append(e)
    held = []
    for onset, flares in sorted(groups.items()):
        warns = sorted((f for f in flares if f.get("alert_level") == "warning"), key=lambda f: f["peak_time"])
        first = warns[0] if warns else None
        held.append({
            "onset": onset, "caught": first is not None,
            "first_warning_flare_id": first["flare_id"] if first else None,
            "first_warning_at": first["peak_time"] if first else None,
            "lead_time_h": first["lead_time_h"] if first else None,
            "flares_linked": len(flares),
            "max_p": round(max(f["p_storm"] for f in flares), 6),
        })
    shelter_e = _shelter_effective(spec, "oct1989")
    return {
        "model": meta["model"], "horizon_h": meta["horizon_hours"],
        "data_credit": meta["data_credit"], "generated_at": meta["generated_at"],
        "quality": QUALITY_MODEL,
        "now": {
            "p_storm": newest["p_storm"], "alert_level": newest["alert_level"],
            "flare_id": newest["flare_id"], "flare_class": newest["flare_class"],
            "peak_time": newest["peak_time"], "source_location": newest.get("source_location"),
            "has_linked_cme": newest.get("has_linked_cme"), "cme_speed_kms": newest.get("cme_speed_kms"),
            "thresholds": meta["thresholds"],
            "action": spec["actions"][newest["alert_level"]],
        },
        "timeline": timeline,
        "headline": {
            "n_storms": metrics["n_storms"],
            "caught": int(round(metrics["hit_rate"] * metrics["n_storms"])),
            "hit_rate": metrics["hit_rate"],
            "false_alarms_per_month": metrics["false_alarms_per_month"],
            "median_lead_time_h": metrics["median_lead_time_h"],
            "brier_skill_vs_climatology": metrics["brier_skill_vs_climatology"],
            "test_period": meta["test_period"], "train_period": meta["train_period"],
        },
        "held_out_storms": held,
        "feature_importance": meta["feature_importance"],
        "how_it_works": list(spec["how_it_works"]),
        "dose_if_storm": {
            "event": "oct1989",
            "hull_effective_mSv": float(val(spec["paper_effective_mSv"]["oct1989"]["hull"])),
            "vest_effective_mSv": float(val(spec["paper_effective_mSv"]["oct1989"]["vest"])),
            "shelter_effective_mSv": _r(shelter_e, 1),
        },
        "sources": _sources(spec, {"DONKI", "S4", "S9", "S10"}),
    }


# ---- doses -------------------------------------------------------------------------------------
def _organ_doses(spec, organ, env, scenario, event, shield, days, rate, chance) -> dict:
    prof = _profile(spec, organ, env)
    per_day = rate * prof
    unit = _event_unit(organ, event, shield)
    if scenario == "gcr":
        bg, ev = per_day * days, 0.0
    elif scenario == "spe":
        bg, ev = 0.0, unit
    else:
        bg, ev = per_day * days, chance * unit
    sources = ["S7", "S8"]
    if scenario == "gcr":
        sources.append("S3")
        if env == "iss":
            sources.append("S4")
    else:
        sources.extend(["S4", "S9"])
    if organ.get("limit"):
        sources.append("S10")
    return {"id": organ["id"], "organ": organ, "bg": bg, "event": ev, "event_unit": unit,
            "total": bg + ev, "sources": sources}


def _event_unit(organ, event: str, shield: str) -> float:
    if shield == "shelter" and event == "oct1989":
        return float(val(organ["shelter_oct1989_mSv"]))
    if shield == "shelter":
        return round(float(val(organ[event]["hull"])) * float(val(organ["shelter_factor"])), 1)
    return float(val(organ[event][shield]))


def _profile(spec, organ, env: str) -> float:
    if env == "iss":
        share = float(val(spec["iss_trapped_share"]))
        return share * float(val(organ["trapped_ratio"])) + (1.0 - share)
    return float(val(spec["gcr"]["profile_uniform"]))


def _effective(spec, dose_by_id: dict) -> float:
    total = 0.0
    for organ in spec["organs"]:
        w = val(organ["w_T"])
        if w:
            total += float(w) * dose_by_id[organ["id"]]
    ids = spec["effective_remainder_ids"]
    mean4 = sum(dose_by_id[i] for i in ids) / len(ids)
    return total + float(val(spec["remainder_w_T"])) * mean4


def _shelter_effective(spec, event: str) -> float:
    doses = {o["id"]: _event_unit(o, event, "shelter") for o in spec["organs"]}
    return _effective(spec, doses)


def _risk_shares(spec, by_id: dict, sex: str) -> dict[str, float]:
    parts = {}
    for organ in spec["organs"]:
        drel = val(organ["d_rel"])
        if organ["id"] == "breast" and sex == "m":
            drel = 0.0
        if drel is None:
            continue
        parts[organ["id"]] = by_id[organ["id"]]["total"] * float(drel)
    mean6 = sum(by_id[i]["total"] for i in spec["risk_remainder_ids"]) / len(spec["risk_remainder_ids"])
    parts["remainder"] = mean6 * float(val(spec["remainder_d_rel"]))
    whole = sum(parts.values()) or 1.0
    return {i: w / whole for i, w in parts.items()}


def _row(spec, built, shares, effective, reid, scenario, days, rate, sex) -> dict:
    organ = built["organ"]
    share = shares.get(organ["id"], 0.0)
    w = val(organ["w_T"])
    drel = val(organ["d_rel"])
    if organ["id"] == "breast" and sex == "m":
        drel = 0.0
    limit, pct, level = _limit(spec, organ, built["event"], built["total"], scenario, days, rate)
    return {
        "id": organ["id"], "label": organ["label"],
        "mesh": organ["mesh"], "pos": val(organ["pos"]), "r": val(organ["r"]), "approx": organ["approx"],
        "dose_mSv": _r(built["total"], 1),
        "dose_bg_mSv": _r(built["bg"], 1),
        "dose_event_mSv": _r(built["event"], 1),
        "w_T": None if w is None else float(w),
        "d_rel": None if drel is None else float(drel),
        "share_of_effective": 0.0 if not w or not effective else round(float(w) * built["total"] / effective, 3),
        "share_of_risk": 0.0 if share == 0 else round(share, 3),
        "risk_pct": round(effective * reid * share, 2),
        "limit": limit, "pct_of_limit": pct, "level": level,
        "heat_dose": 0.0, "heat_risk": 0.0,
        "shelter_saves_mSv": None,
        "source_ids": sorted(set(built["sources"])),
        "_total": built["total"], "_share": share, "_organ": organ,
    }


def _strip(rows, spec, event, scenario, chance) -> None:
    """Fill shelter savings, then drop the keys the response must not carry."""
    for row in rows:
        organ = row.pop("_organ", None)
        if organ is not None and scenario != "gcr":
            hull = _event_unit(organ, event, "hull")
            shelter = _event_unit(organ, event, "shelter")
            factor = chance if scenario == "storm" else 1.0
            row["shelter_saves_mSv"] = _r((hull - shelter) * factor, 1)


def _remainder_row(spec, by_id, shares, effective, reid, scenario, chance) -> dict:
    ids = spec["risk_remainder_ids"]
    mean6 = sum(by_id[i]["total"] for i in ids) / len(ids)
    mean6_bg = sum(by_id[i]["bg"] for i in ids) / len(ids)
    mean6_ev = sum(by_id[i]["event"] for i in ids) / len(ids)
    eff_ids = spec["effective_remainder_ids"]
    mean4 = sum(by_id[i]["total"] for i in eff_ids) / len(eff_ids)
    w = float(val(spec["remainder_w_T"]))
    share = shares.get("remainder", 0.0)
    return {
        "id": "remainder", "label": "Remainder", "mesh": None, "pos": None, "r": None, "approx": True,
        "dose_mSv": _r(mean6, 1), "dose_bg_mSv": _r(mean6_bg, 1), "dose_event_mSv": _r(mean6_ev, 1),
        "w_T": w, "d_rel": float(val(spec["remainder_d_rel"])),
        "share_of_effective": 0.0 if not effective else round(w * mean4 / effective, 3),
        "share_of_risk": round(share, 3),
        "risk_pct": round(effective * reid * share, 2),
        "limit": None, "pct_of_limit": None, "level": "info",
        "heat_dose": 0.0, "heat_risk": 0.0,
        "shelter_saves_mSv": None,
        "source_ids": ["S7", "S8"],
        "_total": mean6, "_share": share,
    }


def _heats(rows: list[dict]) -> None:
    max_d = max(r["_total"] for r in rows) or 1.0
    max_s = max(r["_share"] for r in rows) or 1.0
    for r in rows:
        r["heat_dose"] = round(r["_total"] / max_d, 3)
        r["heat_risk"] = round(r["_share"] / max_s, 3)
        r.pop("_total", None)
        r.pop("_share", None)


def _limit(spec, organ, dose_event, dose_total, scenario, days, rate):
    key = organ.get("limit")
    if not key:
        return None, None, "info"
    lim = spec["limits"][key]
    if scenario in ("spe", "storm"):
        compared = dose_event + float(val(spec["level_bg_days"])) * rate
        cap, kind = val(lim["d30"]), "30d"
    elif days <= 365:
        compared, cap, kind = dose_total, val(lim["y1"]), "1y"
    else:
        compared, cap, kind = dose_total, val(lim["career"]), "career"
    if cap is None:
        return None, None, "info"
    pct = round(100.0 * compared / float(cap), 1)
    if pct >= float(val(spec["level_red_at_pct"])):
        level = "red"
    elif pct >= float(val(spec["level_green_below_pct"])):
        level = "amber"
    else:
        level = "green"
    return {"kind": kind, "value": cap, "unit": lim["unit"]}, pct, level


def _chance(p: float | None, flare: dict | None) -> float:
    if p is None:
        raw = 0.0 if flare is None else float(flare.get("p_storm") or 0.0)
    else:
        raw = float(p)
    return max(0.0, min(1.0, raw))


def _flare_echo(flare: dict | None, chance: float) -> dict | None:
    if flare is None:
        return {"p_storm": chance, "alert_level": None, "flare_id": None, "peak_time": None}
    return {"p_storm": chance, "alert_level": flare.get("alert_level"),
            "flare_id": flare.get("flare_id"), "peak_time": flare.get("peak_time")}


# ---- path --------------------------------------------------------------------------------------
def _gcr_stages(spec):
    skin = float(val(spec["gcr"]["artemis_i_mGy"]["skin_front"]))
    lung = float(val(spec["gcr"]["artemis_i_mGy"]["lung"]))
    stages = []
    for item in spec["stages"]["aug1972"]["items"]:
        stages.append(_stage(item["id"], item["label"], val(item["areal_g_cm2"]), 1.0, skin, lung))
    orion = spec["stages"]["aug1972"]["orion"]
    stages.append(_stage("orion", orion["label"], val(orion["areal_g_cm2"]), 1.0, skin, lung))
    stages.append(_stage("skin", "Skin (first mm)", None, 1.0, skin, lung))
    stages.append(_stage("organ", "Deep organs (BFO)", None, 1.0, skin, lung))
    note = "GCR is almost uniform through the body (Artemis I skin 9.38 mGy, lung 9.44 mGy). " + spec["gcr"]["thicker_shield_note"]
    return stages, {"S1", "S3", "S6"}, note, "GCR", "hard"


def _al_stages(spec, shield: str):
    block = spec["stages"]["aug1972"]
    scale = float(val(block["mSv_per_unit"]))
    items = []
    for item in block["items"]:
        skin = val(item["skin"])
        bfo = val(item["bfo"])
        items.append((item["id"], item["label"], val(item["areal_g_cm2"]),
                      None if skin is None else skin * scale, None if bfo is None else bfo * scale))
    orion = block["orion"]
    # Sit Orion with the hull, after the equipment room and before the shelter slab.
    room_at = next(i for i, s in enumerate(items) if s[0] == "room")
    items.insert(room_at + 1, ("orion", orion["label"], val(orion["areal_g_cm2"]),
                               float(val(orion["skin_mSv"])), float(val(orion["bfo_mSv"]))))
    suit_skin = next(s[3] for s in items if s[0] == "suit")
    stages = [_flux_stage(*s, suit_skin) for s in items]
    current_skin, current_bfo = _current_body(items, shield)
    stages.append(_flux_stage("skin", "Skin (first mm)", None, current_skin, current_bfo, suit_skin))
    stages.append(_flux_stage("organ", "Deep organs (BFO)", None, current_skin, current_bfo, suit_skin))
    note = "Aug 1972 solar protons in aluminium (Wilson 1997 Table 5). Particle count follows skin dose."
    return stages, {"S1", "S4", "S5"}, note, "SPE protons", "soft"


def _water_stages(spec, shield: str):
    block = spec["stages"]["oct1989"]
    scale = float(val(block["mSv_per_unit"]))
    items = []
    for item in block["items"]:
        skin, bfo = val(item["skin"]), val(item["bfo"])
        items.append((item["id"], item["label"], val(item["areal_g_cm2"]),
                      None if skin is None else skin * scale, None if bfo is None else bfo * scale))
    suit_skin = next(s[3] for s in items if s[3])
    stages = [_flux_stage(*s, suit_skin) for s in items]
    current = next(s for s in items if s[0] == "w10")
    stages.append(_flux_stage("skin", "Skin (first mm)", None, current[3], current[4], suit_skin))
    stages.append(_flux_stage("organ", "Deep organs (BFO)", None, current[3], current[4], suit_skin))
    note = "Oct 1989 absorbed dose behind water (Simonsen 1992). Shown as cGy times 10, not NASA dose equivalent."
    return stages, {"S1", "S9"}, note, "SPE protons", "soft"


def _current_body(items, shield: str):
    want = {"hull": "orion", "vest": "orion", "shelter": "shelter"}[shield]
    row = next(s for s in items if s[0] == want)
    return row[3], row[4]


def _flux_stage(sid, label, areal, skin, bfo, suit_skin):
    if skin is None or not suit_skin:
        flux = 1.0
    else:
        flux = round(skin / suit_skin, 3)
    return _stage(sid, label, areal, flux, skin, bfo)


def _stage(sid, label, areal, flux, skin, bfo) -> dict:
    return {"id": sid, "label": label, "areal_g_cm2": areal, "rel_flux": flux,
            "dose_skin_mSv": None if skin is None else _r(skin, 1),
            "dose_bfo_mSv": None if bfo is None else _r(bfo, 1)}


# ---- small -------------------------------------------------------------------------------------
def _check(scenario, event, shield, sex, days) -> None:
    if scenario not in SCENARIOS:
        raise RadError(422, f"scenario must be one of {list(SCENARIOS)}; got {scenario!r}")
    if event not in EVENTS:
        raise RadError(422, f"event must be one of {list(EVENTS)}; got {event!r}")
    if shield not in SHIELDS:
        raise RadError(422, f"shield must be one of {list(SHIELDS)}; got {shield!r}")
    if sex not in ("f", "m"):
        raise RadError(422, "sex must be f or m")
    if not isinstance(days, int) or isinstance(days, bool) or days < 1 or days > 2000:
        raise RadError(422, "days must be 1..2000")


def _sources(spec, ids: set) -> list[dict]:
    return [{"id": s["id"], "label": s["label"], "url": s["url"]} for s in spec["sources"] if s["id"] in ids]


def _r(value: float, n: int) -> float:
    return round(float(value), n)


def _parse(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ")
