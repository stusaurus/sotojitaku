import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class FishingGuideTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guide_root=ROOT/"fishing"/"guides"
        cls.slugs=["beginner","sabiki","choi-nage","no-worm","kids","gear","budget"]
        cls.sitemap=(ROOT/"sitemap.xml").read_text()
        cls.analytics=(ROOT/"fishing"/"guide-analytics.js").read_text()
        cls.budget_js=(ROOT/"fishing"/"guides"/"budget"/"budget.js").read_text()

    def test_all_guides_have_canonical_and_shared_analytics(self):
        for slug in self.slugs:
            html=(self.guide_root/slug/"index.html").read_text()
            self.assertIn(f"https://stusaurus.github.io/sotojitaku/fishing/guides/{slug}/",html)
            self.assertIn("guide-analytics.js",html)

    def test_guide_hub_has_all_commercial_entries(self):
        html=(self.guide_root/"index.html").read_text()
        self.assertIn('href="./gear/"',html)
        self.assertIn('href="./budget/"',html)
        self.assertIn("guide-analytics.js",html)

    def test_sitemap_contains_all_fishing_guides(self):
        for slug in self.slugs:
            self.assertIn(f"/fishing/guides/{slug}/",self.sitemap)
        self.assertGreaterEqual(self.sitemap.count("/fishing/"),9)

    def test_guide_funnel_events_are_tracked(self):
        self.assertIn("fishing_guide_view",self.analytics)
        self.assertIn("fishing_guide_cta",self.analytics)
        self.assertIn("conversion_source",self.analytics)

    def test_guide_cta_does_not_count_navigation_links(self):
        self.assertIn('link.classList.contains("button")',self.analytics)
        self.assertNotIn('href=="../"',self.analytics)
        self.assertNotIn('href=="../../"',self.analytics)

    def test_budget_examples_use_live_verified_catalog_and_product_engine(self):
        self.assertIn('../../data/audited-products.json',self.budget_js)
        self.assertIn('buildProductRecommendations',self.budget_js)
        self.assertIn('selectPlan',self.budget_js)
        self.assertIn('fishing_budget_examples_view',self.budget_js)
        self.assertNotIn('total:5000',self.budget_js)

if __name__=="__main__":
    unittest.main()
