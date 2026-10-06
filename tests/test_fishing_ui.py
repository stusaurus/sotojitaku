import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class FishingUiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index=(ROOT/"fishing/index.html").read_text()
        cls.app=(ROOT/"fishing/app.js").read_text()
        cls.questions=json.loads((ROOT/"fishing/data/questions.json").read_text())
        cls.gear=json.loads((ROOT/"fishing/data/gear.json").read_text())

    def test_canonical_and_ga_are_present(self):
        self.assertIn('https://stusaurus.github.io/sotojitaku/fishing/', self.index)
        self.assertIn('G-GFVSZ8YDQ5', self.index)

    def test_approved_generated_hero_is_used(self):
        self.assertIn('fishing-hero-generated.webp', self.index)
        self.assertIn('class="hero-photo"', self.index)
        self.assertNotIn('class="hero-scene"', self.index)

    def test_mobile_assets_are_cache_busted(self):
        self.assertRegex(self.index, r'href="\./style\.css\?v=[^"]+"')
        self.assertRegex(self.index, r'src="\./app\.js\?v=[^"]+"')

    def test_fail_closed_product_copy_is_present(self):
        self.assertIn('販売状況を確認できた商品だけを表示します', self.app)
        self.assertIn('未確認の商品を無理に出すことはしません', self.app)

    def test_all_person_life_jacket_wording(self):
        owned=next(q for q in self.questions["questions"] if q["id"]=="owned")
        labels={o["value"]:o["label"] for o in owned["options"]}
        self.assertIn("全員分", labels["life_jacket_adult"])
        self.assertIn("全員分", labels["life_jacket_child"])
        gear_labels={g["id"]:g["label"] for g in self.gear["categories"]}
        self.assertIn("全員分", gear_labels["life_jacket_adult"])
        self.assertIn("全員分", gear_labels["life_jacket_child"])

    def test_group_option_is_adult_only_to_avoid_hidden_child_safety_gap(self):
        party=next(q for q in self.questions["questions"] if q["id"]=="party")
        labels={o["value"]:o["label"] for o in party["options"]}
        self.assertEqual(labels["group"], "大人3人以上で")

    def test_result_has_local_rule_gate(self):
        self.assertIn("行く釣り場の公式ルールを確認した", self.app)
        self.assertIn("テトラ・磯・荒天・立入禁止場所", self.app)

    def test_bundle_recommendation_copy_is_present(self):
        self.assertIn("項目まとめて揃う", self.app)
        self.assertIn("rawChecklist", self.app)

    def test_shareable_plan_flow(self):
        self.assertIn("readSharedPlanHash", self.app)
        self.assertIn("normalizePlanAnswers", self.app)
        self.assertIn("sharePlanUrl", self.app)
        self.assertIn("shareCurrentPlan", self.app)
        self.assertIn("fishing_plan_share", self.app)
        self.assertIn("fishing_shared_plan_open", self.app)
        self.assertIn('entry_source:"share"', self.app)
        self.assertIn('id="shareBtn"', self.app)
        self.assertIn("#plan=", self.app)

    def test_camp_like_resume_and_progress_flow(self):
        self.assertIn('DRAFT_KEY="sotojitakuFishingDraft"', self.app)
        self.assertIn("persistDraft", self.app)
        self.assertIn("resumeDraft", self.app)
        self.assertIn("fishing_diagnosis_resume", self.app)
        self.assertIn('id="progressText"', self.index)
        self.assertIn('id="progressLine"', self.index)
        self.assertIn('class="checkmark"', self.app)
        self.assertIn("選んだ内容は、このブラウザに保存されます。", self.app)
        self.assertIn("つづきから", self.app)

    def test_change_conditions_moves_draft_back_to_question_stage(self):
        self.assertIn('persistDraft("question");renderQuestion()', self.app)

    def test_secondary_entry_and_result_resume_match_camp_flow(self):
        self.assertIn('id="previewStartBtn"', self.index)
        self.assertIn('previewStartBtn?.addEventListener("click",start)', self.app)
        self.assertIn('stage,index,answers', self.app)
        self.assertIn('persistDraft("result")', self.app)
        self.assertIn('draft.stage==="result"', self.app)
        self.assertIn('resume_stage:draft.stage==="result"?"result":"question"', self.app)
        self.assertIn('planVisual.dataset.step=String(index)', self.app)

    def test_saved_plan_return_flow(self):
        self.assertIn('id="savedBtn"', self.index)
        self.assertIn("readSavedPlan", self.app)
        self.assertIn("openSavedPlan", self.app)
        self.assertIn("fishing_saved_plan_open", self.app)
        self.assertIn("fishing_plan_saved", self.app)
        self.assertIn("renderResult({trackDiagnosis:false})", self.app)

    def test_rule_toggle_does_not_duplicate_diagnosis_completion(self):
        self.assertIn('renderResult({trackDiagnosis:false})', self.app)
        self.assertIn('if(trackDiagnosis&&isNewResult)', self.app)

    def test_quantity_guidance_is_present(self):
        self.assertIn("renderQuantityGuidance", self.app)
        self.assertIn("1セット＝1本分", self.app)
        self.assertIn("同時使用する本数分", self.app)
        self.assertIn("同行者全員分", self.app)

    def test_first_trip_guidance_is_present(self):
        self.assertIn("renderFitReasons", self.app)
        self.assertIn("renderFirstTripGuide", self.app)
        self.assertTrue((ROOT/"fishing/data/howto.json").exists())
        howto=json.loads((ROOT/"fishing/data/howto.json").read_text())
        self.assertGreaterEqual(len(howto["methods"]["sabiki"]["setup"]), 5)
        self.assertGreaterEqual(len(howto["methods"]["choi_nage"]["setup"]), 5)

    def test_result_coverage_uses_effective_bundle_coverage(self):
        self.assertIn("product.effectiveCoverCategoryIds||product.coverCategoryIds", self.app)
        self.assertIn("p.effectiveCoverCategoryIds||p.coverCategoryIds", self.app)

    def test_life_jacket_quantity_and_total_disclaimer_are_present(self):
        self.assertIn("子どもの人数分を用意してください", self.app)
        self.assertIn("大人2人分を用意してください", self.app)
        self.assertIn("人数分の追加数量はこの合計に含めていません", self.app)

    def test_basket_and_click_revenue_events_are_present(self):
        self.assertIn('track("fishing_basket_view"', self.app)
        self.assertIn("recommendation_role:a.dataset.role", self.app)
        self.assertIn("budget_tier:answers.budget", self.app)

    def test_budget_switch_recalculates_the_whole_basket(self):
        self.assertIn("renderBudgetSwitch", self.app)
        self.assertIn("productSelectionSignature", self.app)
        self.assertIn("sameProducts", self.app)
        self.assertIn("alternateBasket", self.app)
        self.assertIn("現在の確認済み商品では同じ構成が最適です", self.app)
        self.assertIn('id="budgetSwitchBtn"', self.app)
        self.assertIn('track("fishing_budget_switch"', self.app)
        self.assertIn("from_budget:from", self.app)
        self.assertIn("to_budget:to", self.app)
        self.assertIn("answers.budget=to", self.app)
        self.assertIn("renderResult({trackDiagnosis:false})", self.app)

    def test_priority_analytics_distinguish_required_and_optional(self):
        self.assertIn('data-priority="${optional?"optional":"required"}"', self.app)
        self.assertIn("purchase_priority:priority", self.app)
        self.assertIn("purchase_priority:a.dataset.priority", self.app)
        self.assertIn("basket_position:position", self.app)
        self.assertIn("optional_product_count:basket.optionalCount", self.app)

    def test_guide_entry_attribution_reaches_downstream_events(self):
        self.assertIn("readEntryAttribution", self.app)
        self.assertIn('entry_source:"guide"', self.app)
        self.assertIn("entry_guide_slug", self.app)
        self.assertIn("...entryAttribution", self.app)

    def test_required_and_optional_products_are_visually_separated(self):
        self.assertIn("productCoversRequiredGap", self.app)
        self.assertIn("まず揃える", self.app)
        self.assertIn("必須品だけを先に", self.app)
        self.assertIn("余裕があれば追加", self.app)
        self.assertIn('class="optional-products"', self.app)

    def test_featured_bundle_card_and_analytics(self):
        self.assertIn("requiredGapCoverCount", self.app)
        self.assertIn("product-card-featured", self.app)
        self.assertIn("最短で揃える", self.app)
        self.assertIn("このセットを楽天で見る", self.app)
        self.assertIn("bundle_cover_count", self.app)
        self.assertIn('data-cover-count="', self.app)

    def test_no_purchase_needed_state_is_explicit(self):
        self.assertIn("必須の買い足しはありません。", self.app)
        self.assertIn("選んだ手持ち品で、必要な道具は揃っています。", self.app)

    def test_nonshopping_required_gaps_are_not_called_complete(self):
        self.assertIn("nonShoppingRequiredGaps", self.app)
        self.assertIn("楽天で選ぶ必須品はありません。", self.app)
        self.assertIn("未準備の持参品・安全装備が残っています", self.app)
        self.assertIn("サイズ確認が必要な安全装備", self.app)

    def test_child_pfd_fit_selector_is_fail_closed(self):
        self.assertIn('data-child-fit', self.app)
        self.assertIn('m_all', self.app)
        self.assertIn('l_all', self.app)
        self.assertIn('unknown_mixed', self.app)
        self.assertIn('体重15〜25kg未満', self.app)
        self.assertIn('体重25〜40kg未満', self.app)
        self.assertIn('商品は自動選択せず', self.app)
        self.assertIn('fishing_child_pfd_fit_select', self.app)
        self.assertIn('SHIMANO公式サイズ表を確認', self.app)
        self.assertIn('normalized.child_fit', self.app)

if __name__=="__main__":
    unittest.main()
