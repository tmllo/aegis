"""
Event-wise evaluation.

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

Written by Claude at Tomas's request (tutor mode switched off for the unattended build).
"""
from __future__ import annotations

import numpy as np


def overlaps(a: tuple[int, int], b: tuple[int, int]) -> bool:
    """True if inclusive intervals a and b share at least one index."""
    return a[0] <= b[1] and b[0] <= a[1]


def f_beta(p: float, r: float, beta: float = 0.5) -> float:
    b2 = beta * beta
    return 0.0 if p == 0 and r == 0 else (1 + b2) * p * r / (b2 * p + r)


def event_metrics(pred_events, true_events, early_margin: int = 0, beta: float = 0.5) -> dict:
    """tp_true, fn, tp_pred, fp, precision, recall, f_beta, delays, median_delay."""
    pred = sorted(pred_events)
    ext = [(s - early_margin, e) for s, e in true_events]
    delays = []
    for (s, _), w in zip(true_events, ext):
        hits = [p for p in pred if overlaps(p, w)]
        if hits:
            delays.append(int(hits[0][0] - s))
    tp_true = len(delays)
    tp_pred = sum(any(overlaps(p, w) for w in ext) for p in pred)
    fp = len(pred) - tp_pred
    precision = tp_pred / len(pred) if pred else 0.0
    recall = tp_true / len(true_events) if true_events else 0.0
    return {
        "tp_true": tp_true, "fn": len(true_events) - tp_true, "tp_pred": tp_pred, "fp": fp,
        "precision": precision, "recall": recall, "f_beta": f_beta(precision, recall, beta),
        "delays": delays, "median_delay": float(np.median(delays)) if delays else np.nan,
    }


def false_alarms_per_10k(fp: int, n_steps: int) -> float:
    """Normalise false alarms by length so channels of different lengths are comparable."""
    return 1e4 * fp / n_steps if n_steps else 0.0
