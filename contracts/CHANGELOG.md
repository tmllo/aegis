# Contract changelog

Any change to the shape of `storm_forecast.json` or `crew_data.json` goes here first, with date, who, what, and why. Tell the other person before merging.

- 2026-11-14 18:15: v1 created (starter kit).
- 2026-11-15: Crew scoring rule, for Emile's live check-in. The keys in `crew_data.json` are unchanged. A check-in is scored on the mean of that value and the previous 2 days, against the personal baseline (mean and sd of the first 14 days). Amber when the relevant side of z reaches 2. Red when it reaches 3, or when the raw value is outside `absolute_red`. Sleep, mood and exercise stay low-side only. Heart rate, blood pressure, glucose and temperature stay two-sided. Daily dose, cumulative dose and bone loss stay on their absolute limits and are not averaged. The full rule is the client-side section of `DATA_CONTRACT.md`. The simulated storm dose in the crew series moves from 10 Nov 2026 to 5 Sep 2026. That is a data change, not a schema change.
