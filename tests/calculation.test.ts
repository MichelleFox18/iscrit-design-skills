import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate,canAdvance,type Matrix,type Rating } from '../src/lib/model';
// Pure synthetic structural fixture. Never imported into the product catalog.
const matrix:Matrix={areas:[4,3,3,3].map((n,i)=>({id:`area${i}`,name:`test area ${i}`,competencies:Array.from({length:n},(_,j)=>({id:`${i}-${j}`,name:'test-only',description:'',levels:['test','test','test','test']}))})),tracks:[]};
function ratings(value=2):Rating[]{return matrix.areas.flatMap(a=>a.competencies.map(c=>({competency_id:c.id,kind:'final' as const,answer:'rated' as const,value,comment:'',evidence:[]})));}
test('minimum and maximum, percent and grade',()=>{const low=calculate(matrix,ratings(1),'final');assert.equal(low.score,1);assert.equal(low.percent,25);assert.equal(low.grade,'Junior');const high=calculate(matrix,ratings(4),'final');assert.equal(high.score,4);assert.equal(high.percent,100);assert.equal(high.grade,'Уровень 4');});
test('equal area weight instead of competency weight',()=>{const r=ratings(1);r.slice(0,4).forEach(x=>x.value=4);assert.equal(calculate(matrix,r,'final').score,1.75);});
test('N/A and unanswered excluded; 11 numeric is sufficient',()=>{const r=ratings();r[0]={...r[0],answer:'na',value:null};r[4]={...r[4],answer:'unanswered',value:null};const result=calculate(matrix,r,'final');assert.equal(result.count,11);assert.equal(result.score,2);});
test('10 numeric responses is insufficient',()=>{const r=ratings();[0,4,7].forEach(i=>{r[i].answer='na';r[i].value=null});assert.equal(calculate(matrix,r,'final').score,null);});
test('each area minimum is enforced even with 11 total',()=>{for(const indexes of [[0,1],[4,5],[7,8],[10,11]]){const r=ratings();indexes.forEach(i=>{r[i].value=null;r[i].answer='na'});assert.equal(calculate(matrix,r,'final').complete,false);}});
test('empty matrix answers never produce a grade',()=>{assert.equal(calculate(matrix,[],'final').score,null);assert.equal(calculate(matrix,[],'self').grade,null);});
test('grade thresholds apply before display rounding',()=>{
 for(const [values,expected] of [[[1,1,1,2],'Junior'],[[1,1,2,2],'Middle'],[[2,2,2,3],'Middle'],[[2,2,3,3],'Senior'],[[3,3,3,4],'Senior'],[[3,3,4,4],'Уровень 4']] as const){const r=ratings();r.forEach(x=>x.value=values[Number(x.competency_id[0])]);assert.equal(calculate(matrix,r,'final').grade,expected);}
});
test('score uses requested author only',()=>{const r=ratings(4);const s=ratings(1).map(x=>({...x,kind:'self' as const}));assert.equal(calculate(matrix,[...r,...s],'final').score,4);assert.equal(calculate(matrix,[...r,...s],'self').score,1);});
test('only legal sequential transitions and authorized roles',()=>{assert.equal(canAdvance('designer',true,0,1),true);assert.equal(canAdvance('designer',false,0,1),false);assert.equal(canAdvance('designer',true,2,3),false);assert.equal(canAdvance('manager',false,2,3),true);assert.equal(canAdvance('admin',false,4,6),false);assert.equal(canAdvance('admin',false,6,7),false);});
