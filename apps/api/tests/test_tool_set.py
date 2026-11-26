import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import capability_service


class ToolSetTest(unittest.TestCase):
    def test_adds_only_published_capabilities_and_removes_only_references(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory) / "capabilities.json"
            store.write_text(json.dumps({
                "capabilities": [
                    {"id": "cap-published", "name": "Published", "status": "published"},
                    {"id": "cap-draft", "name": "Draft", "status": "draft"},
                ],
                "tool_set": [],
            }), encoding="utf-8")

            with patch.object(capability_service, "_data_path", store):
                added = capability_service.add_tool_set_capabilities(["cap-published", "cap-published"])
                self.assertEqual(added["added_count"], 1)
                self.assertEqual([item["id"] for item in capability_service.list_tool_set()], ["cap-published"])

                with self.assertRaises(ValueError):
                    capability_service.add_tool_set_capabilities(["cap-draft"])

                removed = capability_service.remove_tool_set_capabilities(["cap-published"])
                self.assertEqual(removed["removed_count"], 1)
                self.assertEqual(capability_service.list_tool_set(), [])

            persisted = json.loads(store.read_text(encoding="utf-8"))
            self.assertEqual(len(persisted["capabilities"]), 2)
            self.assertEqual(persisted["capabilities"][0]["status"], "published")
            self.assertEqual(persisted["tool_set"], [])

    def test_deleting_capability_removes_tool_set_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory) / "capabilities.json"
            store.write_text(json.dumps({
                "capabilities": [{"id": "cap-one", "name": "One", "status": "published"}],
                "tool_set": ["cap-one"],
            }), encoding="utf-8")

            with patch.object(capability_service, "_data_path", store):
                self.assertTrue(capability_service.delete_capability("cap-one"))
                self.assertEqual(capability_service.list_tool_set(), [])

            persisted = json.loads(store.read_text(encoding="utf-8"))
            self.assertEqual(persisted["capabilities"][0]["status"], "deleted")
            self.assertEqual(persisted["tool_set"], [])

    def test_batch_status_update_is_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Path(directory) / "capabilities.json"
            capabilities = [
                {"id": f"cap-{index}", "name": f"Capability {index}", "status": "draft"}
                for index in range(10)
            ]
            store.write_text(json.dumps({"capabilities": capabilities, "tool_set": []}), encoding="utf-8")

            with patch.object(capability_service, "_data_path", store):
                result = capability_service.update_capability_status_batch(
                    [item["id"] for item in capabilities], "published"
                )

            self.assertEqual(result["updated_count"], 10)
            persisted = json.loads(store.read_text(encoding="utf-8"))
            self.assertEqual(sum(item["status"] == "published" for item in persisted["capabilities"]), 10)


if __name__ == "__main__":
    unittest.main()
