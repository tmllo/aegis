"""Orbit engine: where a station is, whether it is in sunlight, whether it is in the SAA.

Pure functions over two-line element sets (TLEs). No store, no network, no HTTP shapes.

What it computes, and the approximations it makes (also exposed as MODEL for the API):
- Position: SGP4 (the `sgp4` package) from CelesTrak mean elements, giving a TEME position.
  TEME is rotated to Earth-fixed coordinates by Greenwich Mean Sidereal Time (IAU 1982),
  taking UT1 = UTC and ignoring polar motion (both well under a kilometre at the ground).
  The error is dominated by the age of the elements (about 1-3 km per day for the ISS).
- Sub-satellite point: geodetic latitude, longitude and altitude on the WGS84 ellipsoid.
- Sunlight: low-precision Sun direction from the Astronomical Almanac (about 0.01 deg) and a
  cylindrical Earth shadow (no penumbra, no atmospheric refraction). Sunrise and sunset times
  are good to about a minute.
- SAA: point-in-polygon of the sub-satellite point against the approximate boundary in the
  catalog (`saa.polygon`, [lat, lon] vertices). The boundary is a single contour at ISS altitude;
  the real anomaly drifts, breathes with the solar cycle and depends on altitude.

Times are timezone-aware UTC datetimes inside; points carry ISO strings "YYYY-MM-DDTHH:MM:SSZ".
"""
from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta, timezone

from sgp4.api import Satrec, jday

EARTH_RADIUS_KM = 6378.137                 # WGS84 equatorial radius
_WGS84_F = 1.0 / 298.257223563             # WGS84 flattening
_WGS84_E2 = _WGS84_F * (2.0 - _WGS84_F)    # first eccentricity squared
_TWO_PI = 2.0 * math.pi
_DEG = math.pi / 180.0

MODEL = {  # labels the app and API show for honesty
    "eclipse": "approximate: cylindrical Earth shadow (no penumbra), low-precision Sun position (Astronomical Almanac), timing good to about a minute",
    "position": "SGP4 from CelesTrak mean elements; error grows with elements_age_h (about 1-3 km per day for the ISS)",
}


# ---------------------------------------------------------------- time helpers

def _utc(t: datetime) -> datetime:
    """Treat naive datetimes as UTC; convert aware ones to UTC."""
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


def _jd(t: datetime) -> tuple[float, float]:
    """Julian date split into (whole, fraction) as sgp4 wants it."""
    t = _utc(t)
    return jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond * 1e-6)


def _iso(t: datetime) -> str:
    """ISO string to the nearest second, 'Z' suffix."""
    t = _utc(t)
    if t.microsecond >= 500_000:
        t += timedelta(seconds=1)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _gmst(jd: float, fr: float) -> float:
    """Greenwich Mean Sidereal Time in radians (IAU 1982), UT1 taken as UTC."""
    tut1 = ((jd - 2451545.0) + fr) / 36525.0
    sec = (67310.54841 + (876600.0 * 3600.0 + 8640184.812866) * tut1
           + 0.093104 * tut1 * tut1 - 6.2e-6 * tut1 ** 3)
    return (sec * _TWO_PI / 86400.0) % _TWO_PI


# ---------------------------------------------------------------- elements

def satrec(line1: str, line2: str) -> Satrec:
    """Parse a TLE into an sgp4 Satrec."""
    return Satrec.twoline2rv(line1.strip(), line2.strip())


def epoch_of(line1: str, line2: str) -> datetime:
    """Epoch of the element set, as a UTC datetime (to the microsecond)."""
    sat = satrec(line1, line2)
    jd = (sat.jdsatepoch - 2440587.5) + sat.jdsatepochF   # days since 1970-01-01
    return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(microseconds=round(jd * 86400e6))


def elements_age_h(epoch: datetime, now: datetime) -> float:
    """Hours between the element epoch and now, rounded to 0.1 (negative if epoch is ahead)."""
    return round((_utc(now) - _utc(epoch)).total_seconds() / 3600.0, 1)


# ---------------------------------------------------------------- sunlight

def _sun_hat_jd(jd: float, fr: float) -> tuple[float, float, float]:
    # Astronomical Almanac low-precision formulae (good to ~0.01 deg, 1950-2050).
    n = (jd - 2451545.0) + fr
    mean_lon = (280.460 + 0.9856474 * n) % 360.0
    g = ((357.528 + 0.9856003 * n) % 360.0) * _DEG
    lam = (mean_lon + 1.915 * math.sin(g) + 0.020 * math.sin(2.0 * g)) * _DEG
    eps = (23.439 - 0.0000004 * n) * _DEG
    return (math.cos(lam), math.cos(eps) * math.sin(lam), math.sin(eps) * math.sin(lam))


def sun_direction(t: datetime) -> tuple[float, float, float]:
    """Unit vector towards the Sun, equatorial of date (close enough to TEME for shadow tests)."""
    return _sun_hat_jd(*_jd(t))


def is_sunlit(r_km, sun_hat) -> bool:
    """Cylindrical shadow: dark only if behind the Earth and within one Earth radius of the axis."""
    x, y, z = r_km
    along = x * sun_hat[0] + y * sun_hat[1] + z * sun_hat[2]
    if along >= 0.0:
        return True
    perp2 = x * x + y * y + z * z - along * along
    return perp2 > EARTH_RADIUS_KM * EARTH_RADIUS_KM


# ---------------------------------------------------------------- SAA

def in_saa(lat: float, lon: float, saa: dict | None) -> bool:
    """Ray-casting point-in-polygon on saa["polygon"] ([lat, lon] vertices, implicitly closed).

    Longitude is the x axis and latitude the y axis; the SAA polygon does not cross the
    antimeridian, so no wrap handling is needed.
    """
    if not saa:
        return False
    poly = saa.get("polygon") or []
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        yi, xi = poly[i][0], poly[i][1]
        yj, xj = poly[j][0], poly[j][1]
        if (yi > lat) != (yj > lat):
            x_cross = xi + (lat - yi) * (xj - xi) / (yj - yi)
            if lon < x_cross:
                inside = not inside
        j = i
    return inside


# ---------------------------------------------------------------- position

def _geodetic(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Earth-fixed km -> (geodetic lat deg, lon deg in -180..180, altitude km), WGS84."""
    lon = math.atan2(y, x)
    p = math.hypot(x, y)
    lat = math.atan2(z, p * (1.0 - _WGS84_E2))
    alt = 0.0
    for _ in range(5):   # converges to sub-metre in 2-3 iterations at LEO
        s = math.sin(lat)
        n = EARTH_RADIUS_KM / math.sqrt(1.0 - _WGS84_E2 * s * s)
        alt = p / math.cos(lat) - n
        lat = math.atan2(z, p * (1.0 - _WGS84_E2 * n / (n + alt)))
    return lat / _DEG, lon / _DEG, alt


def _state_jd(sat: Satrec, t: datetime, jd: float, fr: float, saa: dict | None) -> dict:
    err, r, _v = sat.sgp4(jd, fr)
    if err != 0:
        raise ValueError(f"sgp4 error code {err} at {_iso(t)}")
    # TEME -> Earth-fixed: rotate about z by -GMST (polar motion ignored).
    th = _gmst(jd, fr)
    c, s = math.cos(th), math.sin(th)
    x = c * r[0] + s * r[1]
    y = -s * r[0] + c * r[1]
    lat, lon, alt = _geodetic(x, y, r[2])
    return {
        "t": _iso(t),
        "lat": round(lat, 3),
        "lon": round(lon, 3),
        "alt_km": round(alt, 1),
        "sunlit": is_sunlit(r, _sun_hat_jd(jd, fr)),
        "in_saa": in_saa(lat, lon, saa),
    }


def state(sat: Satrec, t: datetime, saa: dict | None) -> dict:
    """{t, lat, lon, alt_km, sunlit, in_saa} at time t. Raises ValueError on an sgp4 error."""
    t = _utc(t)
    jd, fr = _jd(t)
    return _state_jd(sat, t, jd, fr, saa)


def _samples(sat: Satrec, start: datetime, n: int, step_s: float, saa: dict | None):
    """n states at start, start+step, ...; Julian dates stepped arithmetically (fast)."""
    start = _utc(start)
    jd0, fr0 = _jd(start)
    step_d = step_s / 86400.0
    for i in range(n):
        yield _state_jd(sat, start + timedelta(seconds=i * step_s), jd0, fr0 + i * step_d, saa)


def track(line1, line2, start: datetime, minutes: float, step_s: float, saa) -> list[dict]:
    """States from start (inclusive) every step_s seconds for `minutes`: floor(minutes*60/step_s)+1 points."""
    if step_s <= 0:
        raise ValueError("step_s must be positive")
    n = int(math.floor(minutes * 60.0 / step_s + 1e-9)) + 1
    return list(_samples(satrec(line1, line2), start, n, step_s, saa))


# ---------------------------------------------------------------- events and daily counts

def _refine(sat: Satrec, saa, key: str, lo: datetime, hi: datetime, lo_val: bool) -> datetime:
    """Bisect [lo, hi] (key flips between them) down to one second; return the first time after the flip."""
    while (hi - lo).total_seconds() > 1.0:
        mid = lo + (hi - lo) / 2
        if state(sat, mid, saa)[key] == lo_val:
            lo = mid
        else:
            hi = mid
    return hi


def next_events(line1, line2, start: datetime, saa, horizon_min: float = 200, step_s: float = 10) -> dict:
    """First sunrise, sunset, SAA entry and SAA exit strictly after start (ISO or None within the horizon).

    Transitions are found on a step_s grid and refined by bisection to about one second.
    """
    sat = satrec(line1, line2)
    start = _utc(start)
    found = {"sunrise": None, "sunset": None, "saa_entry": None, "saa_exit": None}
    n = int(math.floor(horizon_min * 60.0 / step_s)) + 1
    prev_t, prev = None, None
    for i, cur in enumerate(_samples(sat, start, n, step_s, saa)):
        cur_t = start + timedelta(seconds=i * step_s)
        if prev is not None:
            if cur["sunlit"] != prev["sunlit"]:
                name = "sunrise" if cur["sunlit"] else "sunset"
                if found[name] is None:
                    found[name] = _iso(_refine(sat, saa, "sunlit", prev_t, cur_t, prev["sunlit"]))
            if cur["in_saa"] != prev["in_saa"]:
                name = "saa_entry" if cur["in_saa"] else "saa_exit"
                if found[name] is None:
                    found[name] = _iso(_refine(sat, saa, "in_saa", prev_t, cur_t, prev["in_saa"]))
            if all(v is not None for v in found.values()):
                break
        prev_t, prev = cur_t, cur
    return found


def day_summary(line1, line2, day: date, saa, step_s: float = 30) -> dict:
    """Counts over [day 00:00Z, next day 00:00Z) sampled every step_s seconds.

    sunrises/sunsets and saa_passes count transitions between consecutive samples (a pass
    already in progress at 00:00Z is not an entry). Minutes are sample counts times step_s.
    """
    sat = satrec(line1, line2)
    start = datetime.combine(day, time(0, 0), tzinfo=timezone.utc)
    n = int(round(86400.0 / step_s))
    sunrises = sunsets = saa_passes = dark = saa_n = 0
    prev = None
    for cur in _samples(sat, start, n, step_s, saa):
        if not cur["sunlit"]:
            dark += 1
        if cur["in_saa"]:
            saa_n += 1
        if prev is not None:
            if cur["sunlit"] and not prev["sunlit"]:
                sunrises += 1
            elif prev["sunlit"] and not cur["sunlit"]:
                sunsets += 1
            if cur["in_saa"] and not prev["in_saa"]:
                saa_passes += 1
        prev = cur
    revs_per_day = sat.no_kozai * 1440.0 / _TWO_PI   # mean motion, rad/min -> rev/day
    return {
        "date": day.isoformat(),
        "orbits": round(revs_per_day, 2),
        "sunrises": sunrises,
        "sunsets": sunsets,
        "eclipse_minutes": round(dark * step_s / 60.0, 1),
        "saa_passes": saa_passes,
        "saa_minutes": round(saa_n * step_s / 60.0, 1),
        "step_s": step_s,
    }
