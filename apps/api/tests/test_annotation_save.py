import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main
from app.models import DataSource, SourceType, StorageConfig
from app.repository import JsonRepository
from app.scanner import scan_local_source


class AnnotationSaveTest(unittest.TestCase):
    def test_saves_voc_xml_next_to_image_without_using_managed_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            source_root = workspace / "source"
            image_dir = source_root / "geometry" / "branch-a" / "20261126"
            image_dir.mkdir(parents=True)
            (image_dir / "sample.jpg").write_bytes(b"image")

            repository = JsonRepository(workspace / "catalog.json")
            source = DataSource(
                id="source-test",
                name="测试数据",
                type=SourceType.LOCAL,
                endpoint=str(source_root),
            )
            repository.save_source(source)
            scan = scan_local_source(source.id, source.endpoint)
            repository.replace_assets(source.id, scan.assets)
            asset = scan.assets[0]

            managed_root = workspace / "managed"
            repository.save_storage(StorageConfig(endpoint=str(managed_root)))
            with patch.object(main, "repository", repository):
                response = TestClient(main.app).post(
                    f"/api/data-sources/{source.id}/assets/{asset.id}/annotation",
                    json={
                        "image_width": 100,
                        "image_height": 80,
                        "objects": [{"label": "target", "x": 10, "y": 20, "width": 30, "height": 40}],
                    },
                )

            self.assertEqual(response.status_code, 200)
            target = image_dir / "sample.xml"
            self.assertTrue(target.is_file())
            self.assertFalse(managed_root.exists())
            self.assertEqual(response.json()["path"], str(target.resolve()))
            saved_asset = repository.get_asset(source.id, asset.id)
            self.assertEqual(saved_asset.xml.path, "geometry/branch-a/20261126/sample.xml")


if __name__ == "__main__":
    unittest.main()
