import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIdahoForecastHtml, normalizeIdahoWeek } from '../src/idForecastParser.js';
import { requestedState } from '../src/stateRequests.js';
import { parseDwrFishStockingHtml } from '../src/dwrParser.js';

const clock = new Date('2026-09-27T12:00:00Z');
const html = `<main><h1>Fish Stocking Forecasts</h1><p>Forecasts of fish stocking efforts</p>
<div>Displaying 1 - 2 of 2</div><h2>Southwest Region</h2><table>
<tr><th>Body of Water</th><th>Week To Be Stocked</th><th>Number To Be Stocked</th></tr>
<tr><td><a href='/foo'>Horsethief Reservoir</a></td><td>Sep 21 - Sep 25</td><td>7,500</td></tr>
<tr><td>McDevitt Pond</td><td>Sep 21 - Sep 25</td><td>270</td></tr></table>
<h3>Recent Regional Fishing Articles</h3></main>`;
test('Idaho forecast parses real column order, species, dates, region and quantities', () => {
  const rows = parseIdahoForecastHtml(html, clock);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].water_name, 'Horsethief Reservoir');
  assert.equal(rows[0].county, 'SOUTHWEST REGION');
  assert.equal(rows[0].date_stocked, '2026-09-21');
  assert.equal(rows[0].quantity, 7500);
  assert.equal(rows[0].species, 'RAINBOW TROUT');
});
test('Idaho explicitly empty forecasts do not fall back to old data', () => {
  const empty = `<h1>Fish Stocking Forecasts</h1>Currently No Fish Stocking All - Contextual Events Scheduled`;
  assert.deepEqual(parseIdahoForecastHtml(empty, clock), []);
});
test('Idaho layout regressions fail clearly; not mistaken for zero scheduled', () => {
  assert.throws(() => parseIdahoForecastHtml('<h1>Fish Stocking Forecasts</h1><p>page format changed</p>', clock), /layout changed/);
});
test('Idaho week dates handle next winter, changing months and short ranges', () => {
  assert.equal(normalizeIdahoWeek('Oct 5-9', clock), '2026-10-05');
  assert.equal(normalizeIdahoWeek('Jan 4 - Jan 8', new Date('2026-11-02T12:00:00Z')), '2027-01-04');
  assert.equal(normalizeIdahoWeek('Feb 30 - Mar 3', clock), '');
});
test('State requests accept unsupported US states only, not arbitrary text or live ones', () => {
  assert.equal(requestedState('mt'), 'MT');
  assert.equal(requestedState('New York'), null);
  assert.equal(requestedState('UT'), null);
  assert.equal(requestedState('ID'), null);
  assert.equal(requestedState('XX'), null);
});
test('Utah stocking records preserve date, quantity and average length', () => {
  const rows = parseDwrFishStockingHtml(`<table><tr><td>PROVO R</td><td>Summit</td><td>RAINBOW</td><td>250</td><td>10.14&quot;</td><td>06/10/2026</td></tr></table>`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].water_name, 'PROVO R');
  assert.equal(rows[0].quantity, 250);
  assert.equal(rows[0].avg_length, 10.14);
  assert.equal(rows[0].date_stocked, '2026-06-10');
});

test('Colorado reports parse report dates, not fabricated stocking times', async () => {
  const { parseColoradoStockingHtml } = await import('../src/coStockingParser.js');
  const report = `<main><h2>Trout Stocking Report</h2><table>
    <tr><th>Body of Water</th><th>Region</th><th>Report Date</th></tr>
    <tr><td>Pintail Pond</td><td>northeast</td><td>10/16/2026</td></tr>
    <tr><td>San Miguel River #3</td><td>southwest</td><td>10/9/2026</td></tr>
    </table><p>View Stocking Report Archive</p></main>`;
  const results = parseColoradoStockingHtml(report, clock);
  assert.equal(results.length, 2);
  assert.equal(results[0].water_name, 'Pintail Pond');
  assert.equal(results[0].county, 'NORTHEAST');
  assert.equal(results[0].date_stocked, '2026-10-16');
  assert.equal(results[0].quantity, null);
});
