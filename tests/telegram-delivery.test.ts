import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegramMessage, splitTelegramText } from '../lib/telegram.ts';

test('long previews preserve every character and put approval buttons after the complete preview', async () => {
  const content = 'Full proposed description:\n' + '🌿'.repeat(5000) + '\nApprove within 10 minutes: /confirm ABCDEF12';
  const chunks = splitTelegramText(content);
  assert.equal(chunks.join(''), content);
  assert.ok(chunks.every(chunk => chunk.length <= 4000 && !/[\uD800-\uDBFF]$/.test(chunk)));
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const sent: any[] = [];
  process.env.TELEGRAM_BOT_TOKEN = 'test-only';
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ok:true}));
  };
  try {
    const markup = {inline_keyboard:[[{text:'Approve',callback_data:'confirm:ABCDEF12'}]]};
    await sendTelegramMessage(8262729456, content, markup);
    assert.equal(sent.map(message=>message.text).join(''), content);
    assert.ok(sent.slice(0,-1).every(message=>!message.reply_markup));
    assert.deepEqual(sent.at(-1).reply_markup, markup);
    sent.length=0;
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:false}));
    await assert.rejects(sendTelegramMessage(8262729456,'test'),/did not confirm/);
    globalThis.fetch=async()=>new Response('sensitive provider diagnostic',{status:500});
    await assert.rejects(sendTelegramMessage(8262729456,'test'),error=>
      error instanceof Error && !error.message.includes('sensitive provider diagnostic'));
  } finally {
    globalThis.fetch=previousFetch;
    if(previousToken===undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN=previousToken;
  }
});
