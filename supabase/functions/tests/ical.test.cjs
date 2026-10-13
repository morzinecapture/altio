const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseIcal,validateCalendarUrl,fetchCalendar}=require('../_shared/ical.ts');
const calendar=(event='UID:one\r\nSUMMARY:Airbnb (Alice)\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261012')=>`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n${event}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
test('calendar parser handles folded lines and does not duplicate UIDs',()=>{
 const body=calendar('UID:one\r\nSUMMARY:Airbnb (Ali\r\n ce)\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261012');
 assert.deepEqual(parseIcal(body),[{uid:'one',summary:'Alice',dtstart:'2026-10-09',dtend:'2026-10-12'}]);
 assert.equal(parseIcal(body.replace('END:VCALENDAR',body+'\r\nEND:VCALENDAR')).length,1);
});
for(const invalid of ['<html>login</html>',calendar('UID:x\nDTSTART:20260230\nDTEND:20260302'),calendar('UID:x\nDTSTART:20261012\nDTEND:20261009'),calendar('DTSTART:20261009\nDTEND:20261010'),calendar('UID:x\nRRULE:FREQ=DAILY\nDTSTART:20261009\nDTEND:20261010')])test('invalid/unsupported calendar does not report success '+invalid.slice(0,22),()=>assert.throws(()=>parseIcal(invalid)));
test('blocked dates remain unavailable',()=>assert.equal(parseIcal(calendar('UID:x\nSUMMARY:Airbnb (Not available)\nDTSTART:20261009\nDTEND:20261010'))[0].summary,'Indisponible'));
for(const url of ['http://www.airbnb.fr/calendar/ical/x','https://127.0.0.1/x','https://169.254.169.254/x','https://airbnb.com.evil.example/x','https://user:pass@www.airbnb.com/x','https://ical.booking.com:444/x','file:///etc/passwd'])test('rejects unsafe calendar destination '+url,()=>assert.throws(()=>validateCalendarUrl(url)));
test('fetch refuses a redirect to a private network before requesting it',async()=>{
 let calls=0;await assert.rejects(fetchCalendar('https://www.airbnb.fr/calendar/ical/x',async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1'}})}));assert.equal(calls,1);
});
test('fetch reads a real calendar response',async()=>assert.equal((await fetchCalendar('https://ical.booking.com/v1/export?t=fixture',async()=>new Response(calendar()))).length,1));
test('fetch rejects oversized response without reading it',async()=>await assert.rejects(fetchCalendar('https://ical.booking.com/x',async()=>new Response('x',{headers:{'content-length':String(3*1024*1024)}})),/volumineux/));
test('explicit cancellation preserves its UID even when vendor omits dates',()=>assert.deepEqual(parseIcal(calendar('UID:one\nSTATUS:CANCELLED')),[{uid:'one',summary:'',cancelled:true}]));
