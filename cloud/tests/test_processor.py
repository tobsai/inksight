"""Tests for processing algorithms."""

import pytest
from rmscene.scene_items import Point

from app.smoothing import (
    get_preset,
    normalize_pressure,
    simplify_rdp,
    smooth_gaussian,
    straighten_line,
)


def test_get_preset():
    """Test preset retrieval."""
    preset = get_preset("medium")
    assert preset.name == "medium"
    assert preset.gaussian_sigma == 1.0
    
    # Unknown preset should default to medium
    preset = get_preset("unknown")
    assert preset.name == "medium"


def test_smooth_gaussian():
    """Test Gaussian smoothing."""
    # Create a simple stroke with 5 points
    points = [
        Point(x=0.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=10.0, y=5.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=20.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=30.0, y=5.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=40.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
    ]
    
    smoothed = smooth_gaussian(points, window_size=3, sigma=1.0)
    
    # Should return same number of points
    assert len(smoothed) == len(points)
    
    # Endpoints should be preserved
    assert smoothed[0].x == points[0].x
    assert smoothed[0].y == points[0].y
    assert smoothed[-1].x == points[-1].x
    assert smoothed[-1].y == points[-1].y
    
    # Middle points should be smoothed (different from original)
    assert smoothed[2].x != points[2].x or smoothed[2].y != points[2].y


def test_simplify_rdp():
    """Test RDP simplification."""
    # Create a nearly straight line with one outlier
    points = [
        Point(x=0.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=10.0, y=0.5, speed=1, direction=0, width=2, pressure=128),
        Point(x=20.0, y=10.0, speed=1, direction=0, width=2, pressure=128),  # Outlier
        Point(x=30.0, y=0.5, speed=1, direction=0, width=2, pressure=128),
        Point(x=40.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
    ]
    
    # With low epsilon, should keep the outlier
    simplified = simplify_rdp(points, epsilon=5.0)
    assert len(simplified) > 2
    
    # With high epsilon, should simplify to just endpoints
    simplified = simplify_rdp(points, epsilon=15.0)
    assert len(simplified) == 2


def test_normalize_pressure():
    """Test pressure normalization."""
    points = [
        Point(x=0.0, y=0.0, speed=1, direction=0, width=2, pressure=50),
        Point(x=10.0, y=0.0, speed=1, direction=0, width=2, pressure=100),
        Point(x=20.0, y=0.0, speed=1, direction=0, width=2, pressure=150),
        Point(x=30.0, y=0.0, speed=1, direction=0, width=2, pressure=200),
    ]
    
    normalized = normalize_pressure(points, target_min=10, target_max=245)
    
    # Should return same number of points
    assert len(normalized) == len(points)
    
    # Pressures should be in target range
    for p in normalized:
        assert 10 <= p.pressure <= 245


def test_straighten_line():
    """Test line straightening."""
    # Create a nearly straight line
    points = [
        Point(x=0.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=10.0, y=1.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=20.0, y=0.5, speed=1, direction=0, width=2, pressure=128),
        Point(x=30.0, y=1.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=100.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
    ]
    
    straightened = straighten_line(points, threshold=15.0, min_length=50.0)
    
    # Should return same number of points
    assert len(straightened) == len(points)
    
    # Endpoints should be preserved
    assert straightened[0].x == points[0].x
    assert straightened[0].y == points[0].y
    assert straightened[-1].x == points[-1].x
    assert straightened[-1].y == points[-1].y


def test_short_strokes():
    """Test that short strokes are handled gracefully."""
    # Single point
    points = [Point(x=0.0, y=0.0, speed=1, direction=0, width=2, pressure=128)]
    assert len(smooth_gaussian(points)) == 1
    assert len(normalize_pressure(points)) == 1
    
    # Two points
    points = [
        Point(x=0.0, y=0.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=10.0, y=10.0, speed=1, direction=0, width=2, pressure=128),
    ]
    assert len(smooth_gaussian(points)) == 2
    assert len(simplify_rdp(points)) == 2
