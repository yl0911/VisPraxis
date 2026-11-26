import unittest

from app.capability_service import _github_repository


class GithubCapabilitySourceTest(unittest.TestCase):
    def test_normalizes_repository_url_with_or_without_git_suffix(self):
        expected = ("yl0911", "vispraxis-toolkit", "https://github.com/yl0911/vispraxis-toolkit")
        self.assertEqual(_github_repository("https://github.com/yl0911/vispraxis-toolkit"), expected)
        self.assertEqual(_github_repository("https://github.com/yl0911/vispraxis-toolkit.git"), expected)

    def test_rejects_file_or_branch_urls(self):
        with self.assertRaises(ValueError):
            _github_repository("https://github.com/yl0911/vispraxis-toolkit/tree/main")


if __name__ == "__main__":
    unittest.main()
