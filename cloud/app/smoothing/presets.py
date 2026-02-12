"""Processing presets for InkSight Cloud."""

from dataclasses import dataclass
from typing import Dict


@dataclass
class ProcessingPreset:
    """Configuration preset for processing strokes."""
    name: str
    description: str
    
    # Smoothing
    smoothing_enabled: bool = True
    gaussian_sigma: float = 1.0
    
    # RDP simplification
    rdp_enabled: bool = True
    rdp_epsilon: float = 2.0
    
    # Line straightening
    line_straightening_enabled: bool = True
    straightness_threshold: float = 15.0
    min_line_length: float = 50.0
    
    # Pressure normalization
    pressure_normalization_enabled: bool = True


# Available processing presets
PRESETS: Dict[str, ProcessingPreset] = {
    "minimal": ProcessingPreset(
        name="minimal",
        description="Light touch-up, preserves original character",
        gaussian_sigma=0.8,
        rdp_enabled=False,
        line_straightening_enabled=False,
    ),
    "medium": ProcessingPreset(
        name="medium",
        description="Balanced cleanup (default)",
        gaussian_sigma=1.0,
        rdp_epsilon=2.0,
        straightness_threshold=15.0,
    ),
    "aggressive": ProcessingPreset(
        name="aggressive",
        description="Maximum smoothing and cleanup",
        gaussian_sigma=1.5,
        rdp_epsilon=3.0,
        straightness_threshold=20.0,
    ),
}


def get_preset(name: str) -> ProcessingPreset:
    """Get a processing preset by name, defaults to 'medium' if not found."""
    return PRESETS.get(name, PRESETS["medium"])
