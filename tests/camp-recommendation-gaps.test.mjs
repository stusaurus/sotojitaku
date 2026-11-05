import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from '../scripts/report_camp_recommendation_gaps.mjs';

const observed=Date.parse('2026-11-05T03:30:00Z');
const specUrl='https://example.org/specs/table';
const equipment={
  global_exclude_terms:[],
  categories:[{
    id:'table',include_any:['テーブル'],exclude_any:[],
    required_fields:['table_size','weight'],
  }],
};
const scores={fit:.95,beginner:.95,comfort:.9,portability:.5,value:.85,trust:.95};
const weights={fit:1,beginner:1,comfort:1,portability:1,value:1,trust:1};
const rules={profiles:{
  default:weights, easy_mode:weights, no_car:weights, comfort:weights,
}};
const offer=(n,family)=>{
  const itemUrl='https://item.rakuten.co.jp/teststore/'+n+'/';
  return {
    category:'table',model:'T-'+n,name:'キャンプ テーブル T-'+n,
    itemCode:'teststore:'+n,family, condition:'new',
    audited:true,bodyConfirmed:true,fixedVariant:true,available:true,
    priceAudit:true,quantityPerListing:1,verifiedAt:new Date(observed).toISOString(),
    price:9000,referencePrice:9000,itemUrl,
    affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/abc/?pc='+encodeURIComponent(itemUrl),
    image:'https://thumbnail.image.rakuten.co.jp/test.jpg',
    spec:{table_size:'120x60cm',table_capacity:4,weight:3000},
    evidence:{
      listing:itemUrl,specification:specUrl,
      fields:{table_size:specUrl,weight:specUrl},
    },
    scores,traits:['easy','comfort'],
  };
};

test('diagnostic reflects exact family comfort gate, not maximum among other preferences',()=>{
 const summary=inspect({products:[offer(1,'family-one')]},equipment,rules,observed);
 const table=summary.findings[0];
 assert.equal(table.familyFourComfort.eligibleChoices,1);
 assert.equal(table.familyFourComfort.distinctProductFamilies,1);
 assert.ok(table.blockers.includes('family-four:needs_two_eligible_choices'));
 assert.equal(table.familyFourComfort.hasTwoRealChoices,false);
 assert.equal(summary.verifiedForPublication,false);
});

test('two shop URLs for the same model collapse to one true recommendation family',()=>{
 const summary=inspect({products:[offer(1,'one'),offer(2,'one')]},
                       equipment,rules,observed);
 const table=summary.findings[0];
 // The actual engine deduplicates by product family BEFORE presenting picks:
 // multiple sellers cannot count as two different products.
 assert.equal(table.catalogEntryCount,2);
 assert.equal(table.familyFourComfort.eligibleChoices,1);
 assert.equal(table.familyFourComfort.distinctProductFamilies,1);
 assert.ok(table.blockers.includes('family-four:needs_two_eligible_choices'));
 assert.equal(table.familyFourComfort.hasTwoRealChoices,false);
});

test('two independently eligible product families satisfy the strict supply count',()=>{
 const summary=inspect({products:[offer(1,'one'),offer(2,'two')]},
                       equipment,rules,observed);
 const table=summary.findings[0];
 assert.equal(table.familyFourComfort.eligibleChoices,2);
 assert.equal(table.familyFourComfort.distinctProductFamilies,2);
 assert.equal(table.familyFourComfort.hasTwoRealChoices,true);
 assert.ok(!table.blockers.some(x=>x.startsWith('family-four:')));
 assert.equal(summary.verifiedForPublication,false);
});

test('diagnostic outputs no offer identities, URLs, prices, shipping status or inventory',()=>{
 const summary=inspect({products:[offer(1,'one'),offer(2,'two')]},
                       equipment,rules,observed);
 const encoded=JSON.stringify(summary);
 for(const privateField of [
  'itemUrl','affiliateUrl','itemCode','referencePrice','verifiedAt',
  'https://','teststore','T-1','T-2','"shipping":','"available":','"price":'
 ])assert.equal(encoded.includes(privateField),false,privateField);
 assert.deepEqual(summary.preferences,['easy','comfort','compact','value']);
});
