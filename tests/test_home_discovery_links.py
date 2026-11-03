"""Check that the homepage links to actual, canonical, indexed-in-sitemap guide pages.

Do not create fake keyword pages or assert Google indexing from sitemap presence.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://stusaurus.github.io/sotojitaku/"
TARGETS = {
    "guides/": "キャンプ初心者の準備ガイド",
    "guides/gear/": "キャンプに必要なもの",
    "guides/budget/": "キャンプ初心者の予算",
    "car-stay/car/": "車種から車中泊を考える",
    "car-stay/car/n-box/mat/": "N-BOXの車中泊マット・段差対策",
    "car-stay/car/sienta/2people/": "シエンタで2人の車中泊",
    "car-stay/power/": "電気毛布のポータブル電源・必要Wh計算",
    "fishing/guides/": "釣り初心者の入門ガイド",
    "fishing/guides/gear/": "海釣り初心者の道具一式",
    "fishing/guides/kids/": "子どもと釣りに行く準備",
}


class HomepageDiscoveryLinksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        section = re.search(
            r'<section class="pathways"\s[^>]*>(.*?)</section>',
            cls.home, re.S
        )
        cls.section = section.group(1) if section else ""
        cls.links = re.findall(
            r'<a\s+href="([^"]+)"[^>]*>(.*?)</a>', cls.section, re.S
        )

    def test_homepage_still_has_one_h1_and_three_service_portals(self):
        self.assertEqual(len(re.findall(r"<h1(?:\s[^>]*)?>", self.home)), 1)
        for href in ("camp/", "car-stay/", "fishing/"):
            self.assertIn(f'href="{href}"', self.home)
        self.assertIn('id="find-guide"', self.home)
        self.assertIn('aria-labelledby="pathways-title"', self.home)

    def test_all_descriptive_plain_html_links_exist(self):
        self.assertEqual(len(self.links), len(TARGETS))
        self.assertEqual({href for href, _ in self.links}, set(TARGETS))
        for href, body in self.links:
            self.assertNotIn("onclick=", body)
            self.assertIn(TARGETS[href], re.sub(r"<[^>]+>", "", body))
            self.assertNotIn("nofollow", body)
            self.assertNotIn("javascript:", href)
            target = ROOT / href / "index.html"
            self.assertTrue(target.is_file(), f"Missing real HTML target: {href}")

    def test_every_destination_keeps_its_own_canonical_and_sitemap_entry(self):
        for href in TARGETS:
            html = (ROOT / href / "index.html").read_text(encoding="utf-8")
            expected = BASE + href
            self.assertIn(f"<loc>{expected}</loc>", self.sitemap, href)
            match = re.search(
                r'<link\s+rel="canonical"\s+href="([^"]+)"', html
            )
            self.assertIsNotNone(match, href)
            self.assertEqual(match.group(1), expected, href)

    def test_homepage_does_not_rename_seo_metadata_or_inject_ads(self):
        self.assertIn(
            "<title>SOTOJITAKU｜キャンプ・車中泊・釣りの初心者向け準備診断</title>",
            self.home,
        )
        self.assertNotIn("hb.afl.rakuten.co.jp", self.section)
        self.assertNotIn("<script", self.section)
        self.assertNotIn("商品ランキング", self.section)


if __name__ == "__main__":
    unittest.main()
