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

    def test_storage_sync_keeps_same_named_groups_distinct(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            source_root = workspace / "source"
            for task, content in (("task-a", b"a"), ("task-b", b"b")):
                image_dir = source_root / "geometry" / "matching" / "20261126" / task
                image_dir.mkdir(parents=True)
                (image_dir / "0.png").write_bytes(content)
                (image_dir / "0_1.png").write_bytes(content + b"-icon")
                (image_dir / "0.xml").write_text("<annotation />", encoding="utf-8")
            managed = workspace / "managed"
            repository = JsonRepository(workspace / "catalog.json")
            repository.save_storage(StorageConfig(endpoint=str(managed)))

            with patch.object(main, "repository", repository):
                client = TestClient(main.app)
                source_id = client.post("/api/data-sources", json={
                    "name": "geometry source", "type": "local", "endpoint": str(source_root),
                    "read_only": True, "options": {},
                }).json()["id"]
                client.post(f"/api/data-sources/{source_id}/scan")
                datasets = client.get(f"/api/data-sources/{source_id}/datasets").json()["items"]
                hierarchy = client.get(f"/api/data-sources/{source_id}/hierarchy").json()
                branches = client.get(f"/api/data-sources/{source_id}/branch-previews", params={"category": "geometry"}).json()["items"]
                versions = client.get(f"/api/data-sources/{source_id}/version-previews", params={"category": "geometry", "branch": "matching"}).json()["items"]
                synced = client.post(f"/api/data-sources/{source_id}/storage-sync", json={})

            target = managed / "geometry" / "matching" / "20261126"
            self.assertEqual(datasets[0]["group_count"], 2)
            self.assertEqual(datasets[0]["file_count"], 4)
            self.assertEqual(hierarchy["categories"][0]["count"], 2)
            self.assertEqual(hierarchy["categories"][0]["branches"][0]["versions"][0]["count"], 2)
            self.assertEqual(branches[0]["total"], 2)
            self.assertEqual(len(branches[0]["items"]), 2)
            self.assertEqual(versions[0]["total"], 2)
            self.assertEqual(synced.json()["groups"], 2)
            self.assertEqual(synced.json()["renamed_groups"], 2)
            self.assertEqual(len(list(target.glob("0__*.png"))), 4)
            self.assertEqual(len(list(target.glob("0__*.xml"))), 2)

    def test_ai_hierarchy_mapping_is_shared_by_browser_and_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            source_root = workspace / "mixed-source"
            image_dir = source_root / "geometry" / "matching" / "v1"
            image_dir.mkdir(parents=True)
            (image_dir / "sample.jpg").write_bytes(b"image")
            repository = JsonRepository(workspace / "catalog.json")

            with patch.object(main, "repository", repository), patch.object(main, "analyze_data_hierarchy", return_value={
                "summary": "识别到旧版几何数据目录",
                "provider": "test",
                "model": "test-model",
                "mappings": [{
                    "path_prefix": "geometry/matching/v1", "category": "geometry",
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

    def test_provider_parent_is_not_used_as_dataset_category(self):
        source = main.DataSource(
            id="source-test",
            name="visionengine_geometry",
            type="local",
            endpoint=str(Path("D:/datasets/visionengine/visionengine_geometry")),
        )
        mappings = main._respect_source_root_boundary(source, [{
            "path_prefix": "please_click_the_matching_shape/20250821",
            "category": "VisionEngine",
            "branch": "Geometry",
            "version": "20250821",
            "confidence": 0.9,
            "reason": "split source name",
        }])

        self.assertEqual(mappings[0]["category"], "geometry")
        self.assertEqual(mappings[0]["branch"], "please_click_the_matching_shape")
        self.assertEqual(mappings[0]["version"], "20250821")

        normalized = main._respect_source_root_boundary(source, [{
            "path_prefix": "please_click_the_matching_shape/20250821",
            "category": "visionengine_geometry",
            "branch": "please_click_the_matching_shape",
            "version": "20250821",
        }])
        self.assertEqual(normalized[0]["category"], "geometry")
        self.assertEqual(normalized[0]["branch"], "please_click_the_matching_shape")

        parent_category = main._respect_source_root_boundary(source, [{
            "path_prefix": "please_click_the_matching_shape/20250821",
            "category": "VisionEngine",
            "branch": "please_click_the_matching_shape",
            "version": "20250821",
        }])
        self.assertEqual(parent_category[0]["category"], "geometry")
        self.assertEqual(parent_category[0]["branch"], "please_click_the_matching_shape")

    def test_ai_cannot_invent_category_or_missing_version_labels(self):
        source = main.DataSource(
            id="source-test",
            name="drag_shapesimilar",
            type="local",
            endpoint=str(Path("D:/datasets/hc_drag/drag_shapesimilar")),
        )
        mappings = main._ground_hierarchy_to_source(source, [{
            "path_prefix": "drag_the_block_shape_to_the_place_where_it_fits",
            "category": "GUI",
            "branch": "drag_the_block_shape_to_the_place_where_it_fits",
            "version": "未标注",
        }])

        self.assertEqual(mappings[0]["category"], "drag_shapesimilar")
        self.assertEqual(mappings[0]["branch"], "drag_the_block_shape_to_the_place_where_it_fits")
        self.assertEqual(mappings[0]["version"], "unknown")

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
                client = TestClient(main.app)
                response = client.get("/api/storage/assets")
                hierarchy = client.get("/api/storage/hierarchy").json()
                branches = client.get("/api/storage/branch-previews", params={"category": "geometry"}).json()["items"]
                versions = client.get("/api/storage/version-previews", params={"category": "geometry", "branch": "matching"}).json()["items"]
                annotated = client.get("/api/storage/assets", params={"category": "geometry", "annotated_only": True}).json()
                asset_id = response.json()["items"][0]["id"]
                saved = client.post(f"/api/storage/assets/{asset_id}/annotation", json={
                    "image_width": 120, "image_height": 80,
                    "objects": [{"label": "updated", "x": 10, "y": 10, "width": 20, "height": 30}],
                })

            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual(body["total"], 1)
            self.assertEqual(body["annotation_count"], 1)
            self.assertEqual(body["items"][0]["relative_path"], "geometry/matching/20261126/sample.jpg")
            self.assertEqual(body["items"][0]["xml"]["classes"], {"shape": 1})
            self.assertEqual(hierarchy["categories"][0]["name"], "geometry")
            self.assertEqual(hierarchy["categories"][0]["branches"][0]["versions"][0]["count"], 1)
            self.assertEqual(branches[0]["total"], 1)
            self.assertEqual(versions[0]["total"], 1)
            self.assertEqual(annotated["total"], 1)
            self.assertEqual(saved.status_code, 200)
            self.assertIn("<name>updated</name>", (version / "sample.xml").read_text(encoding="utf-8"))
            self.assertEqual(repository.list_sources(), [])


if __name__ == "__main__":
    unittest.main()
