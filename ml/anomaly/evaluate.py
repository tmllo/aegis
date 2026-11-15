"""
Event-wise evaluation.   >>> TOMAS WRITES THE TODOs <<<

Why event-wise: operators care about "did you catch the failure, and how many false alarms
did you raise", not about how many individual timesteps you got right. And NO point-adjust
(the trick of marking a whole labelled anomaly as detected once a single point inside it
fires). It inflates F1 and people who know the field discount it.

Definitions (the tests rely on them):
- true_events, pred_events: lists of (start, end) index pairs, end inclusive.
- A true event is a HIT if any predicted event overlaps [start - early_margin, end].
- A predicted event is a FALSE ALARM if it overlaps no (margin-extended) true event.
- precision = (pred events that overlap a true event) / (all pred events)
- recall    = hits / (all true events)
- F-beta with beta = 0.5 (precision weighted more): (1+b²)·P·R / (b²·P + R); 0 if P = R = 0
- delay for a hit = (start of the first overlapping pred event) - true start
  (can be negative if the alarm fired inside the early margin)
"""
from __future__ import annotations

import numpy as np


def overlaps(a: tuple[int, int], b: tuple[int, int]) -> bool:
    """True if inclusive intervals a and b share at least one index."""
    # TODO(Tomas): one line.
    raise NotImplementedError


def event_metrics(pred_events, true_events, early_margin: int = 0, beta: float = 0.5) -> dict:
    """Return a dict with keys:
    tp_true (hits), fn (missed true events), tp_pred, fp (false alarms),
    precision, recall, f_beta, delays (list of ints, one per hit), median_delay (np.nan if no hits).

    Edge cases: no pred events -> precision 0.0; no true events -> recall 0.0.
    """
    # TODO(Tomas)
    raise NotImplementedError


def false_alarms_per_10k(fp: int, n_steps: int) -> float:
    """Normalise false alarms by length so channels of different lengths are comparable."""
    # TODO(Tomas)
    raise NotImplementedError
