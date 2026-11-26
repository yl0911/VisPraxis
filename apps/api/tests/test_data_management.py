import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main
from app.capability_service import _representative_hierarchy_paths
from app.models import StorageConfig
from app.repository import JsonRepository


class DataManagementTest(unittest.TestCase):
    def test_hierarchy_prompt_uses_bounded_representative_directories(self):
        paths = {f"category-{index % 8}/branch-{index % 20}/2026{index:04d}/images": index + 1 for index in range(1000)}
        representative = _representative_hierarchy_paths(paths)

        self.assertEqual(len(representative), 120)
        self.assertTrue(all(path in paths for path, _ in representative))

    def test_storage_sync_flattens_dataset_and_protects_existing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            source_root = workspace / "source"
            image_dir = source_root / "geometry" / "matching" / "20261126" / "large-images"
            image_dir.mkdir(parents=True)
            image = image_dir / "sample.jpg"
            image.write_bytes(b"first")
            (image_dir / "sample.xml").write_text("<annotation />", encoding="utf-8")
            managed = workspace / "managed"
            repository = JsonRepository(workspace / "catalog.json")
            repository.save_storage(StorageConfig(endpoint=str(managed)))

            with patch.object(main, "repository", repository):
                client = TestClient(main.app)
                created = client.post("/api/data-sources", json={
                    "name": "geometry source", "type": "local", "endpoint": str(source_root),
                    "read_only": True, "options": {},
                }).json()
                source_id = created["id"]
                self.assertEqual(client.post(f"/api/data-sources/{source_id}/scan").status_code, 200)
                first = client.post(f"/api/data-sources/{source_id}/storage-sync", json={})
                image.write_bytes(b"second")
                protected = client.post(f"/api/data-sources/{source_id}/storage-sync", json={})
                rejected = client.post(f"/api/data-sources/{source_id}/storage-sync", json={"overwrite": True})
                updated = client.post(f"/api/data-sources/{source_id}/storage-sync", json={
                    "dataset": {"category": "geometry", "branch": "matching", "version": "20261126"},
                    "overwrite": True,
                })

            target = managed / "geometry" / "matching" / "20261126"
            self.assertEqual(first.status_code, 200)
            self.assertEqual((target / "sample.jpg").read_bytes(), b"second")
            self.assertTrue((target / "sample.xml").is_file())
            self.assertFalse((target / "large-images").exists())
            self.assertGreaterEqual(protected.json()["skipped"], 2)
            self.assertEqual(rejected.status_code, 422)
            self.assertEqual(updated.status_code, 200)
            self.assertGreaterEqual(updated.json()["updated"], 2)

    def test_ai_hierarchy_mapping_is_shared_by_browser_and_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            source_root = workspace / "mixed-source"
            image_dir = source_root / "legacy-layout" / "large" / "batch-a"
            image_dir.mkdir(parents=True)
            (image_dir / "sample.jpg").write_bytes(b"image")
            repository = JsonRepository(workspace / "catalog.json")

            with patch.object(main, "repository", repository), patch.object(main, "analyze_data_hierarchy", return_value={
                "summary": "识别到旧版几何数据目录",
                "provider": "test",
                "model": "test-model",
                "mappings": [{
                    "path_prefix": "legacy-layout/large/batch-a", "category": "geometry",
                    "branch": "matching", "version": "v1", "confidence": 0.96, "reason": "test",
                }],
            }):
                client = TestClient(main.app)
                source_id = client.post("/api/data-sources", json={
                    "name": "mixed", "type": "local", "endpoint": str(source_root),
                    "read_only": True, "options": {},
                }).json()["id"]
                client.post(f"/api/data-sources/{source_id}/scan")
                analyzed = client.post(f"/api/data-sources/{source_id}/hierarchy/analyze")
                hierarchy = client.get(f"/api/data-sources/{source_id}/hierarchy").json()
                datasets = client.get(f"/api/data-sources/{source_id}/datasets").json()["items"]
                filtered = client.get(f"/api/data-sources/{source_id}/assets", params={
                    "category": "geometry", "branch": "matching", "version": "v1",
                }).json()
                previews = client.get(f"/api/data-sources/{source_id}/version-previews", params={
                    "category": "geometry", "branch": "matching",
                }).json()

            self.assertEqual(analyzed.status_code, 200)
            self.assertEqual(hierarchy["categories"][0]["name"], "geometry")
            self.assertEqual(datasets[0]["branch"], "matching")
            self.assertEqual(filtered["total"], 1)
            self.assertEqual(previews["items"][0]["version"], "v1")
            self.assertEqual(previews["items"][0]["total"], 1)

    def test_duplicate_local_source_reuses_existing_record(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            source_root = workspace / "source"
            source_root.mkdir()
            repository = JsonRepository(workspace / "catalog.json")
            payload = {
                "name": "first name",
                "type": "local",
                "endpoint": str(source_root),
                "read_only": True,
                "options": {},
            }

            with patch.object(main, "repository", repository):
                client = TestClient(main.app)
                first = client.post("/api/data-sources", json=payload)
                second = client.post("/api/data-sources", json={**payload, "name": "updated name"})

            self.assertEqual(first.status_code, 201)
            self.assertEqual(second.status_code, 201)
            self.assertEqual(first.json()["id"], second.json()["id"])
            self.assertEqual(second.json()["name"], "updated name")
            self.assertEqual(len(repository.list_sources()), 1)

    def test_managed_assets_remain_browsable_without_source_record(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            managed = workspace / "managed"
            version = managed / "geometry" / "matching" / "20261126"
            version.mkdir(parents=True)
            (version / "sample.jpg").write_bytes(b"image")
            (version / "sample.xml").write_text(
                "<annotation><size><width>100</width><height>80</height></size>"
                "<object><name>shape</name><bndbox><xmin>1</xmin><ymin>2</ymin><xmax>30</xmax><ymax>40</ymax></bndbox></object>"
                "</annotation>",
                encoding="utf-8",
            )
            repository = JsonRepository(workspace / "catalog.json")
            repository.save_storage(StorageConfig(endpoint=str(managed)))

            with patch.object(main, "repository", repository):
                response = TestClient(main.app).get("/api/storage/assets")

            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual(body["total"], 1)
            self.assertEqual(body["annotation_count"], 1)
            self.assertEqual(body["items"][0]["relative_path"], "geometry/matching/20261126/sample.jpg")
            self.assertEqual(body["items"][0]["xml"]["classes"], {"shape": 1})
            self.assertEqual(repository.list_sources(), [])


if __name__ == "__main__":
    unittest.main()
