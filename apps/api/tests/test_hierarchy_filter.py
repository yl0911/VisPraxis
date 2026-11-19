import unittest

from app.repository import _filter_asset_rows


class HierarchyFilterTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {"filename": "a.jpg", "relative_path": "branch/test/20261111/a.jpg", "hierarchy": ["branch", "test", "20261111"]},
            {"filename": "b.jpg", "relative_path": "branch/20261111/test/b.jpg", "hierarchy": ["branch", "20261111", "test"]},
            {"filename": "c.jpg", "relative_path": "branch/train/20261111/c.jpg", "hierarchy": ["branch", "train", "20261111"]},
        ]

    def test_status_path_ignores_version_position(self):
        result = _filter_asset_rows(self.rows, "branch", None, ["branch/test"], None)
        self.assertEqual([row["filename"] for row in result], ["a.jpg", "b.jpg"])

    def test_branch_and_version_are_semantic_filters(self):
        result = _filter_asset_rows(self.rows, "branch", "20261111", ["branch/train"], None)
        self.assertEqual([row["filename"] for row in result], ["c.jpg"])


if __name__ == "__main__":
    unittest.main()
