/**
 * Read-only CAMP recommendation coverage report.
 *
 * Exposes category-level counts ONLY, not merchant SKUs, prices, inventory,
 * affiliate URLs, or identity tokens. It never changes ranking criteria,
 * safety gates, acceptance thresholds or the original product catalog.
 *
 * Run AFTER isolated verified candidate files are copied into the GitHub
 * Actions runner's checkout for npm test. Reports failures hidden behind
 * node:test assertions that stop after the first missing category.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT } from '../engine.js';
import { recommend, reject } from '../products.js';

const URLS = {
  products: new URL('../data/products.json', import.meta.url),
  equipment: new URL('../data/equipment.json', import.meta.url),
  rules: new URL('../data/recommendation-rules.json', import.meta.url),
  output: new URL('../reports/camp-recommendation-gaps.json', import.meta.url),
};
const preferences = Object.freeze(['easy', 'comfort', 'compact', 'value']);
const profiles = Object.freeze({
  'solo-car': {
    ...DEFAULT, party_type:'solo',adults:1,children:0,
    season:'spring',stay:'one_night',transport:'car',experiences:['easy'],
    budget:'50000',
  },
  'solo-no-car': {
    ...DEFAULT, party_type:'solo',adults:1,children:0,
    season:'spring',stay:'one_night',transport:'no_car',experiences:['easy'],
    budget:'50000',
  },
  'family-four': {
    ...DEFAULT,party_type:'family',adults:2,children:2,
    season:'autumn',stay:'one_night',transport:'car',
    experiences:['bbq','bonfire','coffee'],budget:'100000',
  },
  'couple': {
    ...DEFAULT,party_type:'couple',adults:2,children:0,
    season:'spring',stay:'one_night',transport:'car',
    experiences:['easy'],budget:'50000',
  },
});
export function inspect(catalog, equipment, rules, observed = Date.now()) {
  const categories = equipment.categories.map(c=>c.id);
  const findings = [];
  for (const category of categories) {
    const categoryProducts = (catalog.products || []).filter(p=>p.category===category);
    const profileCoverage = {};
    for (const [profile,answers] of Object.entries(profiles)) {
      // Use the same eligibility gate as recommendations. Counts refer to
      // listings, before recommendation deduplication and the three-card cap.
      // Never expose merchant identities or live offer details in this report.
      const rejectionReasons = {};
      let eligibleListings = 0;
      for (const product of categoryProducts) {
        const reason = reject(product, category, answers, equipment, observed);
        if (reason === null) eligibleListings++;
        else rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      }
      const quantity = profile==='family-four' ? (category==='tent'?1:4)
                     : profile==='couple' ? 2 : 1;
      const budget = profile==='family-four'? (category==='tent'?25000:50000)
                   : profile==='couple'?20000:50000;
      const recommended = preferences.map(preference=>recommend(
        catalog.products||[],category,answers,equipment,rules,
        {preference,quantity,targetBudget:budget},observed));
      const uniqueTop = new Set(recommended.map(r=>r[0]?.model).filter(Boolean)).size;
      const availablePreferences = recommended.filter(r=>r.length>0).length;
      profileCoverage[profile] = {
        eligibility: {
          rejectionBasis: 'first_failed_gate_per_listing',
          evaluatedListings: categoryProducts.length,
          eligibleListings,
          rejectedListings: categoryProducts.length - eligibleListings,
          rejectionReasons,
        },
        availablePreferenceCount: availablePreferences,
        distinctTopCount: uniqueTop,
        maximumEligibleChoices: Math.max(...recommended.map(r=>r.length)),
        hasMissingRecommendation: availablePreferences < preferences.length,
        lacksPreferenceDiversity: uniqueTop < 2,
      };
    }
    const preferenceProfile = category==='tent'?'family-four':'couple';
    const familyNeedsTwo = ['tent','table','cooler','fire_pit'].includes(category);
    const blockers = [];
    // The family-tent gate is stricter than general two-choice diversity.
    // Keep the exact expectations in tests/engine.test.mjs:55 unchanged and
    // expose aggregate match counts only, never the model identities.
    const expectedTentTops = {
      easy:'2000036439',comfort:'2000039087',compact:'2185614',value:'2000038429',
    };
    const tentTops = category==='tent' ? preferences.map(preference=>recommend(
      catalog.products||[],category,profiles['family-four'],equipment,rules,
      {preference,quantity:1,targetBudget:25000},observed)[0]?.model) : [];
    const matchedTentTops = preferences.filter((preference,i)=>
      tentTops[i]===expectedTentTops[preference]).length;
    const strictTentPreferences = category==='tent' ? {
      requiredPreferenceCount:4,
      matchedPreferenceCount:matchedTentTops,
      distinctTopCount:new Set(tentTops.filter(Boolean)).size,
      meetsStrictGate:matchedTentTops===4&&new Set(tentTops.filter(Boolean)).size===4,
    } : null;
    if(strictTentPreferences&&!strictTentPreferences.meetsStrictGate) {
      blockers.push('family-four:strict_tent_preferences_unmet');
    }
    for(const [profile,coverage] of Object.entries(profileCoverage)) {
      if(coverage.hasMissingRecommendation) blockers.push(profile+':no_eligible_choice');
    }
    if(profileCoverage[preferenceProfile].lacksPreferenceDiversity) {
      blockers.push(preferenceProfile+':insufficient_preference_diversity');
    }
    // Mirror the STRICT family-choice test exactly: comfort, quantity and
    // target budget. Separately flag duplicate product families because two
    // separate seller listings for one model are not two consumer choices.
    const familyComfortPicks=familyNeedsTwo ? recommend(
      catalog.products||[],category,profiles['family-four'],equipment,rules,
      {preference:'comfort',quantity:category==='tent'?1:4,targetBudget:50000},
      observed
    ) : [];
    const familyComfortChoices=familyComfortPicks.length;
    const distinctFamilyModels=new Set(familyComfortPicks.map(
      p=>p.family).filter(Boolean)).size;
    if(familyNeedsTwo && familyComfortChoices<2) {
      blockers.push('family-four:needs_two_eligible_choices');
    } else if(familyNeedsTwo && distinctFamilyModels<2) {
      blockers.push('family-four:duplicate_product_family');
    }
    findings.push({
      category,
      catalogEntryCount: categoryProducts.length,
      ...(strictTentPreferences?{familyTentPreferences:strictTentPreferences}:{}),
      ...(familyNeedsTwo?{familyFourComfort:{
        eligibleChoices:familyComfortChoices,
        distinctProductFamilies:distinctFamilyModels,
        hasTwoRealChoices:familyComfortChoices>=2&&distinctFamilyModels>=2,
      }}:{}),
      profileCoverage,
      blockers,
    });
  }
  return {
    schemaVersion:1,
    type:'recommendation_coverage_diagnostic_not_publication_approval',
    checkedAt:new Date(observed).toISOString(),
    catalogProductCount:(catalog.products||[]).length,
    profiles:Object.keys(profiles),
    preferences:[...preferences],
    blockerCategoryCount:findings.filter(f=>f.blockers.length>0).length,
    findings,
    verifiedForPublication:false,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) ===
    fileURLToPath(new URL('file://' + process.argv[1]).href)) {
  const read=(u)=>JSON.parse(fs.readFileSync(u,'utf8'));
  const report=inspect(read(URLS.products),read(URLS.equipment),read(URLS.rules));
  fs.mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});
  fs.writeFileSync(URLS.output, JSON.stringify(report,null,2)+'\n');
  console.log('CAMP_RECOMMENDATION_GAPS',JSON.stringify({
    candidateProducts:report.catalogProductCount,
    blockerCategoryCount:report.blockerCategoryCount,
    blocked:report.findings.filter(f=>f.blockers.length).map(
      f=>({category:f.category,blockers:f.blockers})),
    verifiedForPublication:false,
  }));
}
