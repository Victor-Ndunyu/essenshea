export type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

export function ownerReplyMarkup(response: string): InlineKeyboard | undefined {
  const approval=response.match(/Approve within \d+ minutes: \/confirm ([A-F0-9]{8})/);
  if (approval) return {inline_keyboard:[[{text:'Approve change',callback_data:'confirm:'+approval[1]},{text:'Cancel',callback_data:'cancel:'+approval[1]}]]};
  const choices=[...response.matchAll(/^(\d+)\. (.+)\n\/choose ([A-F0-9]{8}) (\d+)$/gm)];
  if (choices.length) return {inline_keyboard:choices.map(choice=>[{text:choice[2].slice(0,64),callback_data:'choose:'+choice[3]+':'+choice[4]}])};
  return undefined;
}

export function callbackCommand(data: unknown): string | null {
  if (typeof data !== 'string' || Buffer.byteLength(data,'utf8') > 64) return null;
  const approval=data.match(/^(confirm|cancel):([A-F0-9]{8})$/);
  if (approval) return '/'+approval[1]+' '+approval[2];
  const choose=data.match(/^choose:([A-F0-9]{8}):([1-5])$/);
  if (choose) return '/choose '+choose[1]+' '+choose[2];
  const browse=data.match(/^browse:(\d{1,4})$/);
  if (browse) return '/products '+browse[1];
  const product=data.match(/^product:([a-z0-9-]+)$/);
  if (product) return '/describe '+product[1];
  return null;
}
