"""Stroke smoothing algorithms for InkSight.

Operates on lists of rmscene Point objects (x, y, speed, direction, width, pressure).
All algorithms return new Point lists without modifying originals.
"""

import math
from dataclasses import replace
from typing import List, Tuple

from rmscene.scene_items import Point

from .config import InkSightConfig, SmoothingConfig


def _gaussian_weights(window_size: int, sigma: float) -> List[float]:
    """Generate normalized Gaussian kernel weights."""
    half = window_size // 2
    weights = []
    for i in range(-half, half + 1):
        w = math.exp(-(i * i) / (2 * sigma * sigma))
        weights.append(w)
    total = sum(weights)
    return [w / total for w in weights]


def smooth_gaussian(points: List[Point], window_size: int = 5, sigma: float = 1.0) -> List[Point]:
    """Apply Gaussian smoothing to stroke points.

    Smooths x, y coordinates while preserving pressure, speed, direction, width.
    First and last points are preserved exactly to maintain stroke endpoints.
    """
    if len(points) < 3:
        return list(points)

    window_size = min(window_size, len(points))
    if window_size % 2 == 0:
        window_size -= 1
    if window_size < 3:
        return list(points)

    weights = _gaussian_weights(window_size, sigma)
    half = window_size // 2
    result = []

    for i in range(len(points)):
        if i < half or i >= len(points) - half:
            # Preserve endpoints
            result.append(Point(
                x=points[i].x, y=points[i].y,
                speed=points[i].speed, direction=points[i].direction,
                width=points[i].width, pressure=points[i].pressure,
            ))
        else:
            sx = sum(weights[j] * points[i - half + j].x for j in range(window_size))
            sy = sum(weights[j] * points[i - half + j].y for j in range(window_size))
            result.append(Point(
                x=sx, y=sy,
                speed=points[i].speed, direction=points[i].direction,
                width=points[i].width, pressure=points[i].pressure,
            ))

    return result


def smooth_moving_average(points: List[Point], window_size: int = 5) -> List[Point]:
    """Apply moving average smoothing to stroke points."""
    if len(points) < 3:
        return list(points)

    window_size = min(window_size, len(points))
    if window_size % 2 == 0:
        window_size -= 1
    if window_size < 3:
        return list(points)

    half = window_size // 2
    result = []

    for i in range(len(points)):
        if i < half or i >= len(points) - half:
            result.append(Point(
                x=points[i].x, y=points[i].y,
                speed=points[i].speed, direction=points[i].direction,
                width=points[i].width, pressure=points[i].pressure,
            ))
        else:
            sx = sum(points[i - half + j].x for j in range(window_size)) / window_size
            sy = sum(points[i - half + j].y for j in range(window_size)) / window_size
            result.append(Point(
                x=sx, y=sy,
                speed=points[i].speed, direction=points[i].direction,
                width=points[i].width, pressure=points[i].pressure,
            ))

    return result


def _perpendicular_distance(point: Point, line_start: Point, line_end: Point) -> float:
    """Calculate perpendicular distance from point to line segment."""
    dx = line_end.x - line_start.x
    dy = line_end.y - line_start.y
    length_sq = dx * dx + dy * dy

    if length_sq == 0:
        return math.hypot(point.x - line_start.x, point.y - line_start.y)

    t = max(0, min(1, ((point.x - line_start.x) * dx + (point.y - line_start.y) * dy) / length_sq))
    proj_x = line_start.x + t * dx
    proj_y = line_start.y + t * dy
    return math.hypot(point.x - proj_x, point.y - proj_y)


def simplify_rdp(points: List[Point], epsilon: float = 2.0) -> List[Point]:
    """Apply Ramer-Douglas-Peucker simplification.

    Removes points that contribute less than epsilon deviation from the simplified path.
    Good for cleaning up very noisy strokes while preserving overall shape.
    """
    if len(points) < 3:
        return list(points)

    # Find the point with max distance from the line between first and last
    max_dist = 0.0
    max_idx = 0
    for i in range(1, len(points) - 1):
        d = _perpendicular_distance(points[i], points[0], points[-1])
        if d > max_dist:
            max_dist = d
            max_idx = i

    if max_dist > epsilon:
        left = simplify_rdp(points[:max_idx + 1], epsilon)
        right = simplify_rdp(points[max_idx:], epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]


def normalize_pressure(points: List[Point], target_min: int = 10, target_max: int = 245,
                       low_pct: int = 5, high_pct: int = 95) -> List[Point]:
    """Normalize pressure values across a stroke using percentile-based scaling.

    Maps the pressure range [low_percentile, high_percentile] to [target_min, target_max],
    clamping outliers.
    """
    if len(points) < 2:
        return list(points)

    pressures = sorted(p.pressure for p in points)
    n = len(pressures)

    lo_idx = max(0, int(n * low_pct / 100))
    hi_idx = min(n - 1, int(n * high_pct / 100))
    p_lo = pressures[lo_idx]
    p_hi = pressures[hi_idx]

    if p_hi <= p_lo:
        # All pressures are the same or nearly so
        mid = (target_min + target_max) // 2
        return [Point(x=p.x, y=p.y, speed=p.speed, direction=p.direction,
                       width=p.width, pressure=mid) for p in points]

    result = []
    for p in points:
        normalized = (p.pressure - p_lo) / (p_hi - p_lo)
        new_pressure = int(target_min + normalized * (target_max - target_min))
        new_pressure = max(0, min(255, new_pressure))
        result.append(Point(x=p.x, y=p.y, speed=p.speed, direction=p.direction,
                            width=p.width, pressure=new_pressure))
    return result


def _stroke_length(points: List[Point]) -> float:
    """Calculate total length of a stroke."""
    total = 0.0
    for i in range(1, len(points)):
        dx = points[i].x - points[i - 1].x
        dy = points[i].y - points[i - 1].y
        total += math.hypot(dx, dy)
    return total


def _max_deviation(points: List[Point]) -> float:
    """Max perpendicular distance of any point from the line between first and last."""
    if len(points) < 3:
        return 0.0
    return max(_perpendicular_distance(p, points[0], points[-1]) for p in points[1:-1])


def straighten_line(points: List[Point], threshold: float = 15.0,
                    min_length: float = 50.0, max_points: int = 30) -> List[Point]:
    """If a stroke appears to be a straight line, snap it straight.

    Returns the original points if the stroke doesn't look like a line attempt.
    """
    if len(points) < 2 or len(points) > max_points:
        return list(points)

    length = _stroke_length(points)
    if length < min_length:
        return list(points)

    deviation = _max_deviation(points)
    if deviation > threshold:
        return list(points)

    # It's a line! Interpolate all points along the straight path
    start = points[0]
    end = points[-1]
    total_len = _stroke_length(points)
    if total_len == 0:
        return list(points)

    result = [Point(x=start.x, y=start.y, speed=start.speed, direction=start.direction,
                    width=start.width, pressure=start.pressure)]

    cumulative = 0.0
    for i in range(1, len(points)):
        dx = points[i].x - points[i - 1].x
        dy = points[i].y - points[i - 1].y
        cumulative += math.hypot(dx, dy)
        t = cumulative / total_len
        new_x = start.x + t * (end.x - start.x)
        new_y = start.y + t * (end.y - start.y)
        result.append(Point(
            x=new_x, y=new_y,
            speed=points[i].speed, direction=points[i].direction,
            width=points[i].width, pressure=points[i].pressure,
        ))

    return result


def process_stroke(points: List[Point], config: InkSightConfig) -> List[Point]:
    """Apply all configured processing to a single stroke."""
    result = list(points)

    if config.smoothing.enabled and len(result) >= config.smoothing.min_points:
        algo = config.smoothing.algorithm
        if algo == "gaussian":
            result = smooth_gaussian(result, config.smoothing.window_size, config.smoothing.sigma)
        elif algo == "moving_average":
            result = smooth_moving_average(result, config.smoothing.window_size)
        elif algo == "rdp":
            result = simplify_rdp(result, config.smoothing.rdp_epsilon)

    if config.line_straightening.enabled:
        result = straighten_line(
            result,
            threshold=config.line_straightening.straightness_threshold,
            min_length=config.line_straightening.min_length,
            max_points=config.line_straightening.max_points,
        )

    if config.pressure_normalization.enabled:
        result = normalize_pressure(
            result,
            target_min=config.pressure_normalization.target_min,
            target_max=config.pressure_normalization.target_max,
            low_pct=config.pressure_normalization.low_percentile,
            high_pct=config.pressure_normalization.high_percentile,
        )

    return result
