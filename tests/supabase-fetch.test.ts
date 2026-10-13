import test from 'node:test';
import assert from 'node:assert/strict';
import {resilientSupabaseFetch} from '../lib/supabase-fetch.ts';
test('transient read failures retry once, preserving headers and cancellation', async () => {
 let calls = 0;
 const fetcher = async (_input: unknown, init?: RequestInit) => { calls++; assert.ok(init?.signal); assert.equal((init?.headers as any).apikey,'test-key'); if(calls === 1) throw new TypeError('fetch failed'); return new Response('{}'); };
 assert.equal((await resilientSupabaseFetch('https://example.test', {headers:{apikey:'test-key'}},fetcher as typeof fetch)).status,200);
 assert.equal(calls,2);
});
test('a write with a lost response is never replayed', async () => {
 let calls = 0;
 await assert.rejects(resilientSupabaseFetch('https://example.test',{method:'POST'},(async()=>{calls++;throw new TypeError('fetch failed');}) as typeof fetch));
 assert.equal(calls,1);
});
test('read retries are bounded and auth failures do not retry', async () => {
 let calls = 0;
 const fetcher = async () => {calls++; return new Response('',{status:503});};
 assert.equal((await resilientSupabaseFetch('https://example.test',undefined,fetcher as typeof fetch)).status,503); assert.equal(calls,2);
 calls=0; await resilientSupabaseFetch('https://example.test',undefined,(async()=>{calls++;return new Response('',{status:401});}) as typeof fetch);assert.equal(calls,1);
});
