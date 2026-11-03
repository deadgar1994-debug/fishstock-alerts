import test from 'node:test';
import assert from 'node:assert/strict';
import { idahoDate, parseIdahoApiPage, collectIdahoReports } from '../src/idHistoricalParser.js';
import { fetchIdahoEvents } from '../src/idParser.js';
import { SUPPORTED_STATES } from '../src/states.js';

const sourceRow = (overrides = {}) => ({
  id: '1127315429370', name: 'American Falls Reservoir', var: null,
  loc: 'Bannock, Bingham, Power', trib: 'Tributary of Snake River',
  rfw: 1, ffw: 0, n: '36,879', spp: 'Rainbow Trout - Triploid',
  len: 'Fingerling (3-6 inches)', stocked: '10/30/2026', ...overrides,
});
const snapshot = {
  response: 'success', msg: '124,313 matching stocking records in rivers, streams, lakes and reservoirs.', total: 124313,
  rows: [
    sourceRow({ id: '1119715429000', name: 'Chesterfield Reservoir', loc: 'Caribou', n: '334', len: 'Catchable (12-14 inches)', stocked: '10/31/2026' }),
    sourceRow({ id: '1122563422049', name: 'Crowthers Reservoir', loc: 'Oneida', n: '1,100', stocked: '10/31/2026' }),
    sourceRow(),
    sourceRow({ n: '37,068', stocked: '10/30/2026' }),
    sourceRow({ n: '36,962', stocked: '10/29/2026' }),
  ],
};

const time = new Date('2026-11-03T00:00:00Z');
test('parse official agency response and correct comma-separated quantities', () => {
  const {total, rows} = parseIdahoApiPage(snapshot);
  assert.equal(total, 124313); // all-time, not 2026 only
  assert.equal(rows.length, 5);
  assert.equal(rows[1].quantity, 1100);
  assert.equal(rows[0].date_stocked, '2026-10-31');
  assert.equal(rows[0].size_category, 'Catchable (12-14 inches)');
  assert.equal(rows[0].county, 'Caribou');
});
test('preserve individual same-water stocking events, even same day and amount', () => {
  const parsed = parseIdahoApiPage({response:'success',total:3,rows:[sourceRow(),sourceRow(),sourceRow({n:'37,068'})]});
  const events = collectIdahoReports(parsed.rows,{year:2026,now:time});
  assert.equal(events.length, 3);
  assert.equal(new Set(events.map(x=>x.id)).size,3);
  assert.deepEqual(events.map(x=>x.quantity), [36879,36879,37068]);
  assert.ok(events.every(x=>x.state === 'ID' && x.avg_length === null));
});
test('reject bad dates and malformed or changed API responses', () => {
  assert.equal(idahoDate('02/30/2026'),null);
  assert.equal(idahoDate('12/31/2025'),'2025-12-31');
  assert.throws(()=>parseIdahoApiPage({response:'error',total:1,rows:[]}),/unrecognized/);
  assert.throws(()=>parseIdahoApiPage({response:'success',total:5,rows:[sourceRow({spp:undefined})]}),/invalid row|missing a valid/);
  assert.throws(()=>parseIdahoApiPage({response:'success',total:2,rows:[sourceRow({n:'4,abc'})]}),/missing a valid/);
});
test('API pagination advances by actual returned rows and ends at previous year', async () => {
  const allRows = [snapshot.rows[0], snapshot.rows[1], snapshot.rows[2], sourceRow({name:'Lake 2025',stocked:'12/31/2025'})];
  const offsets = [];
  const mockFetch = async (url) => {
    const u = new URL(url);
    assert.equal(u.pathname, '/ifwis/fishingplanner/api/2.0/stocking/');
    assert.equal(u.searchParams.get('sort'),'stocked');
    assert.equal(u.searchParams.get('order'),'desc');
    const offset = Number(u.searchParams.get('offset'));
    offsets.push(offset);
    return {ok:true,json:async()=>({response:'success',total:allRows.length,rows:allRows.slice(offset,offset+2)})};
  };
  const got=await fetchIdahoEvents(2026, {fetchImpl:mockFetch,now:time,pageSize:5000});
  assert.deepEqual(offsets,[0,2]); // even though requested limit was 5000
  assert.equal(got.length,3);
  assert.equal(got[0].water_name,'Chesterfield Reservoir');
  assert.ok(got.every(x=>x.date_stocked.startsWith('2026-')));
  assert.equal(SUPPORTED_STATES.ID.feed_type,'reported');
});
test('Idaho does not silently report partial annual totals when page cap is exceeded', async () => {
  const mockFetch = async (url)=>{
    const offset = Number(new URL(url).searchParams.get('offset'));
    const rows = [sourceRow({name:`Lake ${offset}`,stocked:'10/30/2026'})];
    return {ok:true,json:async()=>({response:'success',total:500,rows})};
  };
  await assert.rejects(fetchIdahoEvents(2026,{fetchImpl:mockFetch,maxPages:2,now:time}),/safety limit/);
});
test('Idaho fails rather than treating a source error or unchanging page as success', async () => {
  await assert.rejects(fetchIdahoEvents(2026,{fetchImpl:async()=>({ok:false,status:503})}),/503/);
  const mockFetch = async()=>({ok:true,json:async()=>({response:'success',total:100,rows:[sourceRow()]})});
  await assert.rejects(fetchIdahoEvents(2026,{fetchImpl:mockFetch,maxPages:10,now:time}),/repeated a page/);
});
test('No records for a future year is a valid zero, not older records',async()=>{
  const mockFetch=async()=>({ok:true,json:async()=>({response:'success',total:1,rows:[sourceRow()]})});
  const result=await fetchIdahoEvents(2027,{fetchImpl:mockFetch,now:time});
  assert.deepEqual(result,[]);
});
