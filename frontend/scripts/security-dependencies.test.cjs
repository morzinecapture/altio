const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('query-string accepts Unicode and malformed URL bytes without exponential decoding',()=>{
 const run=spawnSync(process.execPath,['-e',`const q=require('query-string');const a=q.parse('name=%C3%A9&space=hello+world');if(a.name!=='é'||a.space!=='hello world')process.exit(1);const bad=q.parse('value='+('%E0%A4%A'.repeat(10000)));if(!bad.value)process.exit(2);`],{cwd:require('node:path').resolve(__dirname,'..'),timeout:2000,encoding:'utf8'});
 assert.equal(run.status,0,String(run.error||run.stderr));
});
