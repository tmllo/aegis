# How the habitat anomaly detector works (1 page)

**Job:** watch life-support sensors (CO₂, O₂, pressure, temperature, humidity) and raise an alarm when one stops behaving normally, ideally before it breaks a safety limit, because the habitat is part of crew health.

**How it works, in five steps (per sensor):**
1. **Learn normal.** On a quiet period (the train split for NASA data; the first 14 mission days for the habitat), fit a Ridge regression that predicts the next reading from the previous L readings. It also gets the context known at that moment: command flags on the spacecraft, hour of day in the habitat.
2. **Measure surprise.** At every step, error = |actual − predicted|.
3. **Smooth it.** An exponential moving average (span S) removes one-off blips, so a single noisy point doesn't trigger anything.
4. **Make it unit-free.** Score = (smoothed error − its median in the quiet period) / (1.4826 × its MAD). That's a robust z-score: "how many normal-sized surprises is this?" Because it has no units, the same threshold works for mmHg, kPa and °C, and that is why a threshold tuned on a Mars rover can run on a habitat at all.
5. **Alarm.** Score ≥ amber for at least `min_duration` steps = one event. Events closer than `gap` are merged. Red if the peak ≥ red, or if an absolute safety limit is crossed.

**Settings, all chosen on NASA MSL only:** L = 60, S = 30, amber = 30, red = 60, min duration 10, gap 50.

**How we proved it:** We compared it with three alternatives on NASA JPL's labeled spacecraft telemetry: a static 3σ rule, a gradient-boosting forecaster, and an IsolationForest. Everything was tuned on the Curiosity rover (MSL) and then scored **once** on the SMAP satellite, with event-wise scoring and no point-adjust. Ridge won on MSL. On SMAP: **F0.5 0.44 vs 0.25** for static 3σ, with 4× fewer false alarms per step. But a static threshold tuned the same way scores **0.52**, and the CI of our gain over 3σ includes 0.

**What it does well, and what it doesn't:** It is good at changes in *behaviour*: oscillations, spikes, a signal that stops following its daily rhythm. It is weak on *slow, smooth drifts*: the forecast follows the drift, so the error stays small until the drift speeds up. In the simulated habitat it caught the thermal oscillation, missed the slow leak, and flagged the CO₂ scrubber fault **15 h after** the 3 mmHg limit. A plain level rule would have caught the CO₂ fault 21 h *before* the limit. That's why the product keeps the hard limit rules next to the model, and why the next version should combine the two (validated properly first).

---

## The 5 hardest judge questions, with honest answers

**1. "SMAP and MSL are known to be flawed. Why should I trust these numbers?"**
You're right to ask. Wu & Keogh (2021) showed that many anomalies in these datasets can be found with a one-line rule, that some labels are doubtful, and that point-adjusted scoring makes almost anything look good. So we (a) score event-wise with no point-adjust, (b) report against a trivial static baseline *and* a tuned static baseline, (c) tune on one spacecraft and test on the other, once. Under those rules a tuned one-line threshold actually beats our model on SMAP (0.52 vs 0.44 F0.5). We report that rather than claim state of the art. What the benchmark shows is that our pipeline is honest and transfers across spacecraft. It doesn't prove that ML beats rules.

**2. "So the habitat data is fake?"**
Yes. The habitat stream is simulated, with three planted faults, and every screen and the JSON say so (`simulated_habitat: true`). The validation is on real NASA telemetry. The simulation is there to show the *product*: how an alarm reaches a crew member. It is not evidence about real habitats. The faults were fixed before the detector saw them, and the detector's thresholds were frozen from NASA data, not tuned on the simulation. That's why the demo includes a miss and a late detection.

**3. "Your detector flagged the CO₂ problem after the limit was crossed. What's the point?"**
That's the honest result of a frozen model, and we show it instead of hiding it. Two things. First, the limit rule is always on: at 3.0 mmHg the habitat goes amber regardless of the model, so the crew is never relying on ML alone. Second, the run taught us something useful: forecast-error detectors are blind to slow drifts, while a level rule catches them early (21 h before the limit here) but missed the oscillation the model caught. The two are complementary. Combining them is our next step, and we'll validate that on data neither has seen before we put it on screen.

**4. "Why Ridge regression and not a deep model like the LSTM in the original paper?"**
Three reasons: we can explain it in one sentence, it runs in milliseconds on a laptop with no GPU, and it won our MSL comparison against gradient boosting and IsolationForest. The robust z-score is what makes it portable across sensors. A deep model might score higher, but on these datasets Wu & Keogh's critique applies to deep models too, and we couldn't validate one honestly tonight.

**5. "Does high CO₂ really cause the poor sleep you link it to?"**
We don't claim it does. Elevated cabin CO₂ is a documented NASA concern linked to headaches and poor sleep on the ISS, and NASA-STD-3001 sets the 3 mmHg one-hour limit for that reason. In our simulation, the engineer's low-sleep flags happen to start three days after the planted CO₂ fault, and the app shows that as a "possible environmental cause", never a diagnosis. In a real mission it would be a prompt for the flight surgeon to look, not an answer.
