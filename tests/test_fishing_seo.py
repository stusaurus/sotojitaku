import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SITE_ROOT="https://stusaurus.github.io/sotojitaku/"

def expected_url(path: Path) -> str:
    rel=path.relative_to(ROOT).as_posix()
    if rel=="fishing/index.html":
        return SITE_ROOT+"fishing/"
    return SITE_ROOT+rel.removesuffix("index.html")

class FishingSeoIntegrityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pages=sorted((ROOT/"fishing").rglob("index.html"))
        cls.sitemap=(ROOT/"sitemap.xml").read_text()
        cls.robots=(ROOT/"robots.txt").read_text()

    def test_every_fishing_page_is_in_sitemap(self):
        missing=[]
        for path in self.pages:
            url=expected_url(path)
            if f"<loc>{url}</loc>" not in self.sitemap:
                missing.append(url)
        self.assertEqual(missing,[])

    def test_every_fishing_page_has_exact_canonical(self):
        problems=[]
        for path in self.pages:
            html=path.read_text()
            expected=expected_url(path)
            match=re.search(r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']',html,re.I)
            if not match or match.group(1)!=expected:
                problems.append((path.relative_to(ROOT).as_posix(),match.group(1) if match else None,expected))
        self.assertEqual(problems,[])

    def test_every_fishing_page_has_title_description_and_single_h1(self):
        problems=[]
        for path in self.pages:
            html=path.read_text()
            title=bool(re.search(r"<title>[^<]{8,}</title>",html,re.I))
            desc=bool(re.search(r'<meta\s+name=["\']description["\']\s+content=["\'][^"\']{30,}["\']',html,re.I))
            h1_count=len(re.findall(r"<h1(?:\s[^>]*)?>",html,re.I))
            if not title or not desc or h1_count!=1:
                problems.append((path.relative_to(ROOT).as_posix(),title,desc,h1_count))
        self.assertEqual(problems,[])

    def test_guides_link_back_to_the_planner(self):
        missing=[]
        for path in sorted((ROOT/"fishing"/"guides").rglob("index.html")):
            html=path.read_text()
            # guide hub links one level up; individual guides link two levels up.
            if path.parent.name=="guides":
                has_planner='href="../"' in html
            else:
                has_planner='href="../../"' in html
            if not has_planner:
                missing.append(path.relative_to(ROOT).as_posix())
        self.assertEqual(missing,[])

    def test_robots_advertises_sitemap(self):
        self.assertIn("Sitemap: "+SITE_ROOT+"sitemap.xml",self.robots)
        self.assertIn("Allow: /",self.robots)

if __name__=="__main__":
    unittest.main()
