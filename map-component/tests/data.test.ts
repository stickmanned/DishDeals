import test from "node:test";
import assert from "node:assert/strict";
import {parseMapDeals,isDealInViewport} from "../src/data.ts";
const valid={id:"deal-1",restaurantName:"Example Ramen",title:"Lunch offer",latitude:49.28,longitude:-123.12};
test("accepts a minimal teammate record and strips unrelated fields",()=>{
  assert.deepEqual(parseMapDeals([{...valid,_id:"convex-record",secret:"excluded"}]),[valid]);
  assert.deepEqual(parseMapDeals([]),[]);
});
test("rejects invalid locations, duplicates, and unsafe source links",()=>{
  for(const patch of [{latitude:NaN},{latitude:90},{longitude:181},{longitude:"-123.12"},{discountPercent:101},{price:-1},{sourceUrl:"javascript:alert(1)"},{expiresAt:"not a date"}])assert.throws(()=>parseMapDeals([{...valid,...patch}]));
  assert.throws(()=>parseMapDeals([valid,valid]),/unique/);
});
test("handles regular bounds, antimeridian crossings, and world copies",()=>{
  const base={west:-124,east:-122,south:49,north:50,center:[-123,49.5] as [number,number],zoom:12};
  assert.equal(isDealInViewport(valid,base),true);
  assert.equal(isDealInViewport({...valid,latitude:51},base),false);
  const crossing={...base,west:170,east:190};
  assert.equal(isDealInViewport({...valid,longitude:-175},crossing),true);
  assert.equal(isDealInViewport({...valid,longitude:175},crossing),true);
  assert.equal(isDealInViewport(valid,crossing),false);
  assert.equal(isDealInViewport(valid,{...base,west:-200,east:200}),true);
});
