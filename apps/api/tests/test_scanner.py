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


if __name__ == "__main__":
    unittest.main()
