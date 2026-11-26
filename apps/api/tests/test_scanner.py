import tempfile
import unittest
from pathlib import Path

from app.scanner import scan_local_source


class LocalScannerTest(unittest.TestCase):
    def test_indexes_images_companions_and_voc_xml_without_modifying_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            branch = root / "visionengine_geometry" / "click_the_two_matching_shapes" / "20261109"
            branch.mkdir(parents=True)
            (branch / "sample.jpg").write_bytes(b"original")
            (branch / "sample_1.png").write_bytes(b"crop")
            (branch / "sample.xml").write_text(
                "<annotation><object><name>0</name></object><object><name>1</name></object></annotation>",
                encoding="utf-8",
            )

            result = scan_local_source("source-test", str(root))

            self.assertEqual(result.image_count, 2)
            self.assertEqual(result.xml_count, 1)
            main = next(asset for asset in result.assets if asset.filename == "sample.jpg")
            self.assertEqual(main.hierarchy, ["visionengine_geometry", "click_the_two_matching_shapes", "20261109"])
            self.assertEqual(main.companion_images, ["visionengine_geometry/click_the_two_matching_shapes/20261109/sample_1.png"])
            self.assertEqual(main.xml.object_count, 2)
            self.assertEqual(main.xml.classes, {"0": 1, "1": 1})
            self.assertEqual((branch / "sample.jpg").read_bytes(), b"original")

    def test_inventory_marks_launch_candidates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "main.py").write_text("print('run')", encoding="utf-8")
            (root / "helper.py").write_text("VALUE = 1", encoding="utf-8")
            from app.capability_service import _scan_local

            inventory, _ = _scan_local(str(root))

            self.assertEqual(inventory["launch_candidates"], ["main.py"])

    def test_groups_icon_suffix_companions_with_double_underscore_primary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version = root / "drag" / "complement" / "20250812"
            version.mkdir(parents=True)
            primary_name = "sample_1__"
            (version / f"{primary_name}.png").write_bytes(b"primary")
            (version / f"{primary_name}_icon0.png").write_bytes(b"icon-0")
            (version / f"{primary_name}_icon1.png").write_bytes(b"icon-1")

            result = scan_local_source("source-icons", str(root))

            primary = next(asset for asset in result.assets if asset.filename == f"{primary_name}.png")
            companions = [asset for asset in result.assets if asset.role == "companion"]
            self.assertEqual(len(companions), 2)
            self.assertEqual(len(primary.companion_images), 2)
            self.assertTrue(all(asset.primary_relative_path == primary.relative_path for asset in companions))

    def test_groups_companions_across_images_and_icon_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version = root / "drag" / "complement" / "20251013"
            images = version / "images"
            icons = version / "icon"
            images.mkdir(parents=True)
            icons.mkdir()
            primary_name = "sample_1__"
            (images / f"{primary_name}.png").write_bytes(b"primary")
            (icons / f"{primary_name}_icon0.png").write_bytes(b"icon")

            result = scan_local_source("source-cross-directory", str(root))

            primary = next(asset for asset in result.assets if asset.role == "primary")
            companion = next(asset for asset in result.assets if asset.role == "companion")
            self.assertEqual(primary.companion_images, ["drag/complement/20251013/icon/sample_1___icon0.png"])
            self.assertEqual(companion.primary_relative_path, primary.relative_path)

    def test_applies_ai_association_directory_and_suffix_rules(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version = root / "drag" / "complement" / "v2"
            primary_dir = version / "screens"
            crop_dir = version / "pieces"
            primary_dir.mkdir(parents=True)
            crop_dir.mkdir()
            (primary_dir / "sample.png").write_bytes(b"primary")
            (crop_dir / "sample_crop0.png").write_bytes(b"crop")

            result = scan_local_source("source-ai-rules", str(root), association_rules={
                "content_directories": ["screens", "pieces"],
                "suffix_markers": ["_crop"],
            })

            primary = next(asset for asset in result.assets if asset.role == "primary")
            companion = next(asset for asset in result.assets if asset.role == "companion")
            self.assertEqual(primary.companion_images, ["drag/complement/v2/pieces/sample_crop0.png"])
            self.assertEqual(companion.primary_relative_path, primary.relative_path)

    def test_groups_background_and_xml_from_parallel_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version = root / "drag" / "complement" / "v3"
            images = version / "images"
            backgrounds = version / "bg"
            annotations = version / "xml"
            images.mkdir(parents=True)
            backgrounds.mkdir()
            annotations.mkdir()
            (images / "sample.png").write_bytes(b"primary")
            (backgrounds / "sample_bg.png").write_bytes(b"background")
            (annotations / "sample.xml").write_text("<annotation><object><name>part</name></object></annotation>", encoding="utf-8")

            result = scan_local_source("source-parallel-documents", str(root))

            primary = next(asset for asset in result.assets if asset.role == "primary")
            self.assertEqual(primary.companion_images, ["drag/complement/v3/bg/sample_bg.png"])
            self.assertIsNotNone(primary.xml)
            self.assertEqual(primary.xml.path, "drag/complement/v3/xml/sample.xml")


if __name__ == "__main__":
    unittest.main()
