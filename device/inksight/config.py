"""Configuration management for InkSight daemon."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import yaml


@dataclass
class SmoothingConfig:
    enabled: bool = True
    algorithm: str = "gaussian"
    window_size: int = 5
    sigma: float = 1.0
    rdp_epsilon: float = 2.0
    min_points: int = 5


@dataclass
class PressureConfig:
    enabled: bool = True
    target_min: int = 10
    target_max: int = 245
    low_percentile: int = 5
    high_percentile: int = 95


@dataclass
class StraighteningConfig:
    enabled: bool = True
    straightness_threshold: float = 15.0
    min_length: float = 50.0
    max_points: int = 30


@dataclass
class ProcessingConfig:
    use_enhanced_layer: bool = True
    enhanced_layer_name: str = "InkSight Enhanced"
    skip_tools: List[int] = field(default_factory=lambda: [6, 8])
    only_tools: List[int] = field(default_factory=list)


@dataclass
class CloudConfig:
    enabled: bool = False
    api_url: str = ""
    api_key: str = ""
    queue_file: str = "/home/root/.inksight/cloud_queue.json"


@dataclass
class LoggingConfig:
    level: str = "INFO"
    file: str = "/home/root/.inksight/inksight.log"
    max_size_mb: int = 10
    backup_count: int = 3


@dataclass
class DaemonConfig:
    pid_file: str = "/home/root/.inksight/inksight.pid"
    foreground: bool = False


@dataclass
class InkSightConfig:
    xochitl_dir: str = "/home/root/.local/share/remarkable/xochitl"
    poll_interval: float = 2.0
    idle_threshold: float = 30.0
    smoothing: SmoothingConfig = field(default_factory=SmoothingConfig)
    pressure_normalization: PressureConfig = field(default_factory=PressureConfig)
    line_straightening: StraighteningConfig = field(default_factory=StraighteningConfig)
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    cloud: CloudConfig = field(default_factory=CloudConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    daemon: DaemonConfig = field(default_factory=DaemonConfig)

    @classmethod
    def from_yaml(cls, path: str) -> "InkSightConfig":
        """Load configuration from a YAML file."""
        with open(path, "r") as f:
            data = yaml.safe_load(f) or {}

        config = cls()
        config.xochitl_dir = data.get("xochitl_dir", config.xochitl_dir)
        config.poll_interval = data.get("poll_interval", config.poll_interval)
        config.idle_threshold = data.get("idle_threshold", config.idle_threshold)

        if "smoothing" in data:
            s = data["smoothing"]
            config.smoothing = SmoothingConfig(
                enabled=s.get("enabled", True),
                algorithm=s.get("algorithm", "gaussian"),
                window_size=s.get("window_size", 5),
                sigma=s.get("sigma", 1.0),
                rdp_epsilon=s.get("rdp_epsilon", 2.0),
                min_points=s.get("min_points", 5),
            )

        if "pressure_normalization" in data:
            p = data["pressure_normalization"]
            config.pressure_normalization = PressureConfig(
                enabled=p.get("enabled", True),
                target_min=p.get("target_min", 10),
                target_max=p.get("target_max", 245),
                low_percentile=p.get("low_percentile", 5),
                high_percentile=p.get("high_percentile", 95),
            )

        if "line_straightening" in data:
            ls = data["line_straightening"]
            config.line_straightening = StraighteningConfig(
                enabled=ls.get("enabled", True),
                straightness_threshold=ls.get("straightness_threshold", 15.0),
                min_length=ls.get("min_length", 50.0),
                max_points=ls.get("max_points", 30),
            )

        if "processing" in data:
            pr = data["processing"]
            config.processing = ProcessingConfig(
                use_enhanced_layer=pr.get("use_enhanced_layer", True),
                enhanced_layer_name=pr.get("enhanced_layer_name", "InkSight Enhanced"),
                skip_tools=pr.get("skip_tools", [6, 8]),
                only_tools=pr.get("only_tools", []),
            )

        if "cloud" in data:
            c = data["cloud"]
            config.cloud = CloudConfig(
                enabled=c.get("enabled", False),
                api_url=c.get("api_url", ""),
                api_key=c.get("api_key", ""),
                queue_file=c.get("queue_file", "/home/root/.inksight/cloud_queue.json"),
            )

        if "logging" in data:
            lg = data["logging"]
            config.logging = LoggingConfig(
                level=lg.get("level", "INFO"),
                file=lg.get("file", "/home/root/.inksight/inksight.log"),
                max_size_mb=lg.get("max_size_mb", 10),
                backup_count=lg.get("backup_count", 3),
            )

        if "daemon" in data:
            d = data["daemon"]
            config.daemon = DaemonConfig(
                pid_file=d.get("pid_file", "/home/root/.inksight/inksight.pid"),
                foreground=d.get("foreground", False),
            )

        return config

    @classmethod
    def load(cls, path: Optional[str] = None) -> "InkSightConfig":
        """Load config from path, falling back to defaults."""
        search_paths = [
            path,
            os.environ.get("INKSIGHT_CONFIG"),
            "/home/root/.inksight/config.yaml",
            "/etc/inksight/config.yaml",
            os.path.join(os.path.dirname(__file__), "..", "config.yaml"),
        ]
        for p in search_paths:
            if p and os.path.isfile(p):
                return cls.from_yaml(p)
        return cls()
