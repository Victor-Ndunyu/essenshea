import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('mens-care matches whole terms instead of the men substring in pigmentation', async () => {
  const source=await readFile(new URL('../website/assets/js/shop.js',import.meta.url),'utf8');
  const options=source.slice(source.indexOf('const concernOptions ='),source.indexOf('const routineOptions ='));
  const functions=source.slice(source.indexOf('function normalizeSearchValue('),source.indexOf('function getProductConcernLabels('));
  const infer=runInNewContext(options+functions+';getProductConcernIds');
  const scrub={title:'300g Turmeric Face & Body Scrub',category:'Body Scrubs',description:'Help with hyperpigmentation and gently exfoliate face and body'};
  assert.equal(infer(scrub).includes('mens-care'),false);
  for(const title of ['Body balm for men','Wood & Spice balm','Beard oil']) {
    assert.equal(infer({...scrub,title}).includes('mens-care'),true,title);
  }
  assert.deepEqual(Array.from(infer({...scrub,explicitConcerns:['glow']})),['glow']);
});
