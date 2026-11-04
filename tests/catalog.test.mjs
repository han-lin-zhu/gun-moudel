import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, findModels } from '../src/catalog.js';
test('catalog supports normalized model names, aliases, years and IDs', () => {
  for (const query of ['AK-47', 'ak 47', '卡拉什尼科夫', '001', '1947']) assert.deepEqual(findModels(query).map(x => x.id), ['ak47']);
  assert.deepEqual(findModels('m 1913').map(x => x.id), ['m1913']);
  assert.deepEqual(findModels('1913 手枪').map(x => x.id), ['m1913']);
});
test('combined filter, empty results, clear and chronological sorting', () => {
  assert.equal(findModels('AK', '手枪').length, 0);
  assert.equal(findModels('no-such-model').length, 0);
  assert.equal(findModels('', 'all').length, catalog.length);
  assert.deepEqual(findModels('', 'all', 'year').map(x => x.id), ['m1913', 'ak47']);
  assert.equal(new Set(catalog.map(x => x.id)).size, catalog.length);
});
