"""Smoothing algorithms for InkSight Cloud.

Copied from device code and adapted for cloud processing.
"""

from .algorithms import (
    normalize_pressure,
    process_stroke,
    simplify_rdp,
    smooth_gaussian,
    smooth_moving_average,
    straighten_line,
)
from .presets import PRESETS, ProcessingPreset, get_preset

__all__ = [
    "smooth_gaussian",
    "smooth_moving_average",
    "simplify_rdp",
    "normalize_pressure",
    "straighten_line",
    "process_stroke",
    "ProcessingPreset",
    "PRESETS",
    "get_preset",
]
