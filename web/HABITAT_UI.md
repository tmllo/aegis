# Emile: habitat watch UI (~60 min)

Build against `public/data/habitat_telemetry.json` (the sample is already in shape; Tomas overwrites it later, and no code change should be needed). Contract: `../contracts/HABITAT_CONTRACT.md`. Don't hardcode anything that lives in the JSON.

## Paste into Claude Code
> Read web/CLAUDE.md and contracts/HABITAT_CONTRACT.md. Load public/data/habitat_telemetry.json alongside the other two files. Build, in this order:
> 1. **Mission header pill**: "Habitat" + `status.overall` colour; click opens the Habitat tab.
> 2. **Habitat tab**: one row per channel in `channels` (label, latest value + unit, status chip from `status.by_channel`), a sparkline of `series` (last 14 days by default, toggle full mission) with the `limits` line, a thin score strip coloured by `meta.thresholds`, and markers at each anomaly's `detected_at` and `limit_crossed_at`. Below: anomaly cards (newest first) showing message, action, severity, lead time ("flagged 35 h before the limit"), and honest tags: planted + detected = "caught", planted + not detected = "missed", not planted = "false alarm".
> 3. **Validation card** from `meta.validation`: model vs static baseline (precision, recall, F0.5, false alarms per 10k steps), "Tuned on MSL, tested on SMAP". Hide the numbers and show "validation pending" if they're null.
> 4. **Crew link**: in the astronaut body panel, if any anomaly has a `linked_crew_flags` entry with this crew_id and metric, show a chip "Possible environmental cause: {channel label} {message}" that opens that anomaly in the Habitat tab. Light the channel's `body_region` with a subtle outline (not the status colour; the crew status stays the crew's).
> 5. Footer text: "Habitat telemetry simulated. Detector validated on NASA SMAP/MSL telemetry."
> Keep it offline and static. Same design language as the rest (calm, big numerals).

## Demo beat (adds ~20 s)
Kenji (c2) is red on the brain → sleep panel → chip "Possible environmental cause: Cabin CO₂" → Habitat tab → CO₂ curve with the detection marker before the 3 mmHg limit line → "We flagged the scrubber 35 hours before the limit."
