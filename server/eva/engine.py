"""Deterministic EVA suit simulation. Every constant is in server/catalog/eva.yaml.

Heart rate starts at the crew member's simulated resting baseline and rises with activity.
The part of that rise that comes from walking is multiplied by surface gravity, so the same
task costs less on the Moon (0.166 g) than on Mars (0.38 g). Metabolic rate sets oxygen use,
CO2 production and heat. The emergency profile plants a scrubber failure, an oxygen leak and
a rising coolant loop. storm=1 multiplies the dose part-way through and the dose rule fires
ABORT TO HABITAT.

Seed is sha256(subject|site|profile). storm is not in the seed: it changes dose and alerts only.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
from pathlib import Path

QUALITY = "simulated"
LEVELS = ("advisory", "caution", "warning", "emergency")
RANK = {name: i for i, name in enumerate(LEVELS)}
STATUS_RANK = {"nominal": 0, "caution": 1, "warning": 2, "abort": 3}
SCRUBBER = ("NOMINAL", "DEGRADED", "FAULT")
FRAME_FIELDS = {
    "bio": ("hr_bpm", "spo2_pct", "resp_rate_bpm", "core_temp_c", "metabolic_w"),
    "suit": ("o2_pct", "o2_time_left_min", "ppco2_mmHg", "pressure_psi", "coolant_c",
             "battery_v", "battery_pct", "scrubber"),
    "env": ("dose_uSv_h", "dose_cum_uSv", "ext_temp_c", "gravity_g", "sunlit"),
}
OUT = Path(__file__).resolve().parents[1] / "out" / "eva"


class EvaError(ValueError):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


def spec_of(cat) -> dict:
    spec = (cat.extra or {}).get("eva")
    if not spec:
        raise EvaError(500, "catalog has no eva.yaml")
    return spec


def baseline_hr(cat, store, subject: str) -> float:
    """Same number crew_data.json publishes: mean of the first baseline_days of sim_crew vital.hr."""
    days = cat.mission["scoring"]["baseline_days"]
    vals = [o.value for o in store.observations(subject=subject, metric="vital.hr", source="sim_crew")]
    vals = vals[:days]
    if len(vals) < 3:
        raise EvaError(404, f"no heart-rate baseline for {subject}")
    return round(sum(vals) / len(vals), 2)


def dose_uSv_h(cat, site_id: str) -> float:
    """Habitat assumed_dose_mSv_day / 24 * 1000, rounded to 0.01 uSv/h."""
    site = _site(cat, site_id)
    hab = cat.subjects.get(site["habitat_id"])
    if hab is None or "assumed_dose_mSv_day" not in hab:
        raise EvaError(500, f"site {site_id} has no habitat dose")
    return round(hab["assumed_dose_mSv_day"] / 24 * 1000, 2)


def sites_document(cat) -> dict:
    spec = spec_of(cat)
    sites = []
    for sid, s in spec["sites"].items():
        sites.append({
            "id": sid,
            "label": s["label"],
            "gravity_g": s["gravity_g"],
            "dose_uSv_h": dose_uSv_h(cat, sid),
            "ext_temp_c": {"min": s["ext_temp_c"]["min"], "max": s["ext_temp_c"]["max"]},
            "sol_hours": s["sol_hours"],
            "light_delay_s": {"min": s["light_delay_s"]["min"], "max": s["light_delay_s"]["max"]},
            "habitat": {"name": s["habitat"]["name"], "lat": s["habitat"]["lat"], "lon": s["habitat"]["lon"]},
            "waypoints": [{k: w[k] for k in ("id", "name", "distance_m", "bearing_deg", "task")}
                          for w in s["waypoints"]],
        })
    return {"sites": sites, "quality": QUALITY, "sources": _sources(spec)}


def simulate(cat, *, subject: str, site: str, profile: str, minutes: int, step_s: int,
             storm: int, hr_rest: float) -> dict:
    spec = spec_of(cat)
    site_s = _site(cat, site)
    prof = _profile(cat, profile)
    _check_run(spec, minutes, step_s, storm)
    if hr_rest is None:
        raise EvaError(422, "heart-rate baseline is required")

    duration_s = int(minutes) * 60
    step = int(step_s)
    g = float(site_s["gravity_g"])
    quiet = dose_uSv_h(cat, site)
    phys, suit, motion, env_t = spec["physiology"], spec["suit"], spec["motion"], spec["env_trace"]
    storm_s = spec["storm"]
    storm_at = duration_s * float(storm_s["start_fraction"]) if storm else None
    phase = _rng(subject, site, profile).random() * math.tau
    period = float(motion["wobble_period_s"])

    o2_L = float(suit["o2"]["tank_L"])
    co2_extra = 0.0
    distance = 0.0
    dose_cum = 0.0
    frames = []
    t = 0
    while t <= duration_s:
        activity = _activity(prof, t, duration_s, phase, period)
        metabolic = _metabolic(phys, activity, g)
        hr = hr_rest + activity * (phys["hr"]["suit_overhead_bpm"] + phys["hr"]["locomotion_bpm_at_1g"] * g)
        scrubber = _scrubber(prof, t)
        leak = _leak_L_per_min(prof, suit, t)
        vo2_per_min = metabolic * 60.0 / (phys["o2_kj_per_L"] * 1000.0)
        vco2_per_min = vo2_per_min * phys["rq"]
        removal = suit["co2"]["removal"][scrubber]
        o2_pct = 100.0 * o2_L / suit["o2"]["tank_L"]
        rate_L_min = vo2_per_min + leak
        o2_time = (o2_L / rate_L_min) if rate_L_min > 0 else 0.0
        ppco2 = suit["co2"]["setpoint_mmHg"] + co2_extra
        coolant = suit["coolant"]["base_c"] + max(0.0, metabolic - phys["metabolic"]["rest_w"]) * suit["coolant"]["per_w"]
        if prof.get("coolant_rise_after_s") is not None and t >= prof["coolant_rise_after_s"]:
            coolant += prof["coolant_rise_c_per_min"] * (t - prof["coolant_rise_after_s"]) / 60.0
        battery_pct = max(0.0, 100.0 * (1.0 - t / (suit["battery"]["duration_min"] * 60.0)))
        span_v = suit["battery"]["full_v"] - suit["battery"]["empty_v"]
        battery_v = suit["battery"]["empty_v"] + span_v * battery_pct / 100.0
        dose = quiet
        if storm_at is not None and t >= storm_at:
            dose = round(quiet * storm_s["dose_multiplier"], 2)
        spo2 = phys["spo2"]["rest_pct"]
        spo2 -= max(0.0, ppco2 - phys["spo2"]["per_mmHg_above"]) * phys["spo2"]["per_mmHg"]
        spo2 -= max(0.0, phys["spo2"]["per_o2_below"] - o2_pct) * phys["spo2"]["per_o2"]
        spo2 = max(phys["spo2"]["floor_pct"], min(100.0, spo2))
        resp = phys["resp"]["rest_bpm"] + phys["resp"]["per_activity"] * activity
        resp += max(0.0, ppco2 - phys["resp"]["per_mmHg_above"]) * phys["resp"]["per_mmHg"]
        core = phys["core"]["rest_c"] + max(0.0, metabolic - phys["core"]["above_w"]) * phys["core"]["per_w"]
        core += max(0.0, coolant - phys["core"]["coolant_above_c"]) * phys["core"]["per_coolant"]
        tmin, tmax = site_s["ext_temp_c"]["min"], site_s["ext_temp_c"]["max"]
        ext = tmin + (tmax - tmin) * env_t["day_fraction"]
        ext += (tmax - tmin) * env_t["swing"] * math.sin(t / period + phase)
        ext = min(tmax, max(tmin, ext))
        wp = _waypoint(site_s["waypoints"], distance)
        state = {
            "hr_bpm": int(round(hr)),
            "ppco2_mmHg": round(ppco2, 2),
            "o2_pct": round(o2_pct, 1),
            "coolant_c": round(coolant, 1),
            "battery_pct": round(battery_pct, 1),
            "scrubber": scrubber,
            "dose_uSv_h": round(dose, 2),
        }
        status, alerts = judge(spec, state)
        frames.append({
            "t_s": t,
            "activity": round(activity, 3),
            "distance_m": round(distance, 1),
            "waypoint_id": wp["id"],
            "nav": {
                "target": wp["name"],
                "distance_m": round(max(0.0, wp["distance_m"] - distance), 1),
                "bearing_deg": wp["bearing_deg"],
            },
            "bio": {
                "hr_bpm": state["hr_bpm"],
                "spo2_pct": round(spo2, 1),
                "resp_rate_bpm": int(round(resp)),
                "core_temp_c": round(core, 2),
                "metabolic_w": int(round(metabolic)),
            },
            "suit": {
                "o2_pct": state["o2_pct"],
                "o2_time_left_min": round(o2_time, 1),
                "ppco2_mmHg": state["ppco2_mmHg"],
                "pressure_psi": suit["pressure_psi"],
                "coolant_c": state["coolant_c"],
                "battery_v": round(battery_v, 2),
                "battery_pct": state["battery_pct"],
                "scrubber": scrubber,
            },
            "env": {
                "dose_uSv_h": state["dose_uSv_h"],
                "dose_cum_uSv": round(dose_cum, 2),
                "ext_temp_c": round(ext, 1),
                "gravity_g": g,
                "sunlit": bool(env_t["sunlit"]),
            },
            "alerts": alerts,
            "status": status,
        })
        if t + step > duration_s:
            break
        o2_L = max(0.0, o2_L - rate_L_min * (step / 60.0))
        co2_extra += vco2_per_min * (1.0 - removal) * (step / 60.0) * suit["co2"]["gain_mmHg_per_L"]
        speed = motion["speed_m_s"] * prof["speed_scale"] * (
            motion["activity_floor"] + (1.0 - motion["activity_floor"]) * activity)
        distance += speed * step
        dose_cum += dose * (step / 3600.0)
        t += step

    return {
        "subject": subject,
        "site": site,
        "profile": profile,
        "storm": int(storm),
        "start": f"{cat.mission['today']}T{spec['start_time']}",
        "step_s": step,
        "quality": QUALITY,
        "sources": _sources(spec),
        "frames": frames,
        "summary": _summary(spec, minutes, frames),
    }


def assess(cat, *, subject: str, site: str, hr_rest: float,
           bio: dict | None, suit: dict | None, env: dict | None) -> dict:
    """One snapshot through the same rules. Missing fields stay at a rested walk on this site."""
    rested = simulate(cat, subject=subject, site=site, profile="walk", minutes=1, step_s=60,
                      storm=0, hr_rest=hr_rest)["frames"][0]
    state = {
        "hr_bpm": rested["bio"]["hr_bpm"],
        "ppco2_mmHg": rested["suit"]["ppco2_mmHg"],
        "o2_pct": rested["suit"]["o2_pct"],
        "coolant_c": rested["suit"]["coolant_c"],
        "battery_pct": rested["suit"]["battery_pct"],
        "scrubber": rested["suit"]["scrubber"],
        "dose_uSv_h": rested["env"]["dose_uSv_h"],
    }
    flat = {
        "hr_bpm": ("bio", "hr_bpm"),
        "ppco2_mmHg": ("suit", "ppco2_mmHg"),
        "o2_pct": ("suit", "o2_pct"),
        "coolant_c": ("suit", "coolant_c"),
        "battery_pct": ("suit", "battery_pct"),
        "battery_v": ("suit", "battery_v"),
        "scrubber": ("suit", "scrubber"),
        "dose_uSv_h": ("env", "dose_uSv_h"),
    }
    given = {"bio": bio or {}, "suit": suit or {}, "env": env or {}}
    for group, fields in FRAME_FIELDS.items():
        for key in given[group]:
            if key not in fields:
                raise EvaError(422, f"unknown {group} field {key!r}")
    for key, (group, src) in flat.items():
        if src not in given[group]:
            continue
        raw = given[group][src]
        if key == "scrubber":
            if raw not in SCRUBBER:
                raise EvaError(422, f"scrubber must be one of {list(SCRUBBER)}")
            state[key] = raw
        else:
            try:
                state[key] = float(raw)
            except (TypeError, ValueError):
                raise EvaError(422, f"{group}.{src} must be a number")
    status, alerts = judge(spec_of(cat), state)
    return {"status": status, "alerts": alerts, "quality": QUALITY, "sources": _sources(spec_of(cat))}


def judge(spec: dict, state: dict) -> tuple[str, list[dict]]:
    alerts = []
    for rule in spec["alerts"]["rules"]:
        hit = _rule(rule, state)
        if hit is not None:
            alerts.append(hit)
    if not alerts:
        return "nominal", []
    worst = max(alerts, key=lambda a: RANK[a["level"]])["level"]
    return spec["status_from_level"][worst], alerts


def write_offline(cat, hr_rest: float, dest: Path | None = None) -> list[Path]:
    """c1 traverse, storm on, for each offline site. Idempotent: the same two files every build."""
    spec = spec_of(cat)
    off = spec["offline"]
    root = dest or OUT
    root.mkdir(parents=True, exist_ok=True)
    written = []
    for site in off["sites"]:
        doc = simulate(cat, subject=off["subject"], site=site, profile=off["profile"],
                       minutes=off["minutes"], step_s=off["step_s"], storm=off["storm"], hr_rest=hr_rest)
        path = root / f"{site}_{off['profile']}_storm.json"
        path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
        written.append(path)
    return written


# ---- pieces ------------------------------------------------------------------------------------
def _sources(spec: dict) -> list[dict]:
    return [{"id": s["id"], "credit": s["credit"]} for s in spec["sources"]]


def _site(cat, site: str) -> dict:
    sites = spec_of(cat)["sites"]
    if site not in sites:
        raise EvaError(422, f"site must be one of {list(sites)}; got {site!r}")
    return sites[site]


def _profile(cat, profile: str) -> dict:
    profiles = spec_of(cat)["profiles"]
    if profile not in profiles:
        raise EvaError(422, f"profile must be one of {list(profiles)}; got {profile!r}")
    return profiles[profile]


def _check_run(spec: dict, minutes: int, step_s: int, storm: int) -> None:
    lim = spec["limits"]
    if not isinstance(minutes, int) or isinstance(minutes, bool) or not 1 <= minutes <= lim["minutes_max"]:
        raise EvaError(422, f"minutes must be 1..{lim['minutes_max']}")
    if not isinstance(step_s, int) or isinstance(step_s, bool) or not lim["step_s_min"] <= step_s <= lim["step_s_max"]:
        raise EvaError(422, f"step_s must be {lim['step_s_min']}..{lim['step_s_max']}")
    if storm not in (0, 1):
        raise EvaError(422, "storm must be 0 or 1")
    n = minutes * 60 // step_s + 1
    if n > lim["max_frames"]:
        raise EvaError(422, f"too many frames: {n} > {lim['max_frames']}")


def _rng(subject: str, site: str, profile: str) -> random.Random:
    digest = hashlib.sha256(f"{subject}|{site}|{profile}".encode()).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _activity(prof: dict, t: int, duration_s: int, phase: float, period: float) -> float:
    wobble = prof["wobble"] * math.sin(t / period + phase)
    kind = prof["motion"]
    if kind == "steady":
        a = prof["base"] + wobble
    elif kind == "burst":
        hot = (t % prof["burst_every_s"]) < prof["burst_for_s"]
        a = (prof["burst"] if hot else prof["base"]) + wobble
    else:
        a = prof["base"] + prof["leg_amp"] * math.sin((t / duration_s) * math.pi * prof["legs"]) + wobble
    return min(1.0, max(0.0, a))


def _metabolic(phys: dict, activity: float, g: float) -> float:
    m = phys["metabolic"]
    return m["rest_w"] + activity * (m["suit_w"] + m["locomotion_w_at_1g"] * g)


def _scrubber(prof: dict, t: int) -> str:
    fault_at = prof.get("fault_after_s")
    if fault_at is None:
        return "NOMINAL"
    if t >= fault_at:
        return "FAULT"
    if t >= prof["degrade_after_s"]:
        return "DEGRADED"
    return "NOMINAL"


def _leak_L_per_min(prof: dict, suit: dict, t: int) -> float:
    after = prof.get("o2_leak_after_s")
    if after is None or t < after:
        return 0.0
    return suit["o2"]["tank_L"] * prof["o2_leak_pct_per_min"] / 100.0


def _waypoint(waypoints: list[dict], distance: float) -> dict:
    for w in waypoints:
        if distance < w["distance_m"]:
            return w
    return waypoints[-1]


def _rule(rule: dict, state: dict) -> dict | None:
    if rule["kind"] == "match":
        hit = rule["when"].get(state[rule["field"]])
        if not hit:
            return None
        return {"level": hit["level"], "code": rule["code"], "text": hit["text"], "action": hit["action"]}
    value = state[rule["field"]]
    for band in rule["bands"]:
        at = band["at"]
        if (value >= at) if rule["side"] == "high" else (value <= at):
            shown = int(value) if rule["field"] == "hr_bpm" else round(float(value), 1)
            text = rule["text"][band["level"]].replace("{value}", str(shown))
            return {"level": band["level"], "code": rule["code"], "text": text,
                    "action": rule["action"][band["level"]]}
    return None


def _summary(spec: dict, minutes: int, frames: list[dict]) -> dict:
    counts = {level: 0 for level in LEVELS}
    worst_code: dict[str, str] = {}
    worst_status = "nominal"
    for frame in frames:
        if STATUS_RANK[frame["status"]] > STATUS_RANK[worst_status]:
            worst_status = frame["status"]
        for alert in frame["alerts"]:
            prev = worst_code.get(alert["code"])
            if prev is None or RANK[alert["level"]] > RANK[prev]:
                worst_code[alert["code"]] = alert["level"]
    for level in worst_code.values():
        counts[level] += 1
    verdict = {
        "abort": "Abort. Return to the habitat now.",
        "warning": "Warning. End the EVA and return to the habitat.",
        "caution": "Caution. Finish the task and head back.",
        "nominal": "Nominal. Continue the EVA.",
    }[worst_status]
    return {
        "duration_min": minutes,
        "max_hr": max(f["bio"]["hr_bpm"] for f in frames),
        "o2_used_pct": round(frames[0]["suit"]["o2_pct"] - frames[-1]["suit"]["o2_pct"], 1),
        "dose_total_uSv": frames[-1]["env"]["dose_cum_uSv"],
        "alerts_by_level": counts,
        "verdict": verdict,
    }
