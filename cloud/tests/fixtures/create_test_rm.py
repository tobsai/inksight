"""Script to create a minimal test .rm file for integration tests."""

from io import BytesIO
from pathlib import Path

from rmscene import write_blocks
from rmscene.scene_items import Line, Point
from rmscene.scene_stream import (
    AuthorIdsBlock,
    Block,
    MigrationInfoBlock,
    PageInfoBlock,
    SceneLineItemBlock,
    SceneTreeBlock,
)


def create_minimal_rm_file() -> bytes:
    """Create a minimal valid .rm v6 file with test strokes.
    
    Creates a simple document with a few strokes to test processing:
    - A wavy line (should be smoothed)
    - A nearly straight line (should be straightened)
    - A simple diagonal (minimal changes)
    """
    blocks: list[Block] = []
    
    # Header blocks
    blocks.append(MigrationInfoBlock(migration_id=1, is_device=False))
    blocks.append(PageInfoBlock(loads_count=1, merges_count=0, text_chars_count=0, text_lines_count=0))
    blocks.append(AuthorIdsBlock(author_uuids={0: "00000000-0000-0000-0000-000000000000"}))
    blocks.append(SceneTreeBlock(tree_id=0, node_id=1, is_update=True, parent_id=0))
    
    # Stroke 1: Wavy line (needs smoothing)
    wavy_points = [
        Point(x=10.0, y=10.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=20.0, y=15.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=30.0, y=8.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=40.0, y=18.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=50.0, y=12.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=60.0, y=16.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=70.0, y=10.0, speed=1, direction=0, width=2, pressure=128),
    ]
    
    wavy_line = Line(
        tool=2,  # Pen
        color=0,  # Black
        unknown_line_attribute_1=2,
        points=wavy_points,
        unknown_line_attribute_2=0,
    )
    
    blocks.append(SceneLineItemBlock(
        item_index=1,
        item=SceneLineItemBlock.LineItem(
            node_id=2,
            value=wavy_line,
        )
    ))
    
    # Stroke 2: Nearly straight line (should be straightened)
    straight_points = [
        Point(x=100.0, y=100.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=120.0, y=101.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=140.0, y=99.5, speed=1, direction=0, width=2, pressure=128),
        Point(x=160.0, y=100.5, speed=1, direction=0, width=2, pressure=128),
        Point(x=180.0, y=100.0, speed=1, direction=0, width=2, pressure=128),
    ]
    
    straight_line = Line(
        tool=2,  # Pen
        color=0,  # Black
        unknown_line_attribute_1=2,
        points=straight_points,
        unknown_line_attribute_2=0,
    )
    
    blocks.append(SceneLineItemBlock(
        item_index=2,
        item=SceneLineItemBlock.LineItem(
            node_id=3,
            value=straight_line,
        )
    ))
    
    # Stroke 3: Simple diagonal (minimal processing)
    diagonal_points = [
        Point(x=200.0, y=200.0, speed=1, direction=0, width=2, pressure=128),
        Point(x=250.0, y=250.0, speed=1, direction=0, width=2, pressure=128),
    ]
    
    diagonal_line = Line(
        tool=2,  # Pen
        color=0,  # Black
        unknown_line_attribute_1=2,
        points=diagonal_points,
        unknown_line_attribute_2=0,
    )
    
    blocks.append(SceneLineItemBlock(
        item_index=3,
        item=SceneLineItemBlock.LineItem(
            node_id=4,
            value=diagonal_line,
        )
    ))
    
    # Write to bytes
    output = BytesIO()
    write_blocks(output, blocks)
    return output.getvalue()


if __name__ == "__main__":
    # Create the test fixture
    rm_content = create_minimal_rm_file()
    
    # Save to fixtures directory
    fixtures_dir = Path(__file__).parent
    output_path = fixtures_dir / "test_document.rm"
    
    with open(output_path, "wb") as f:
        f.write(rm_content)
    
    print(f"Created test .rm file: {output_path}")
    print(f"Size: {len(rm_content)} bytes")
