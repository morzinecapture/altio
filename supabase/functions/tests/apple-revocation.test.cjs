const{test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const{appleClientSecret,revokeAppleAuthorization,appleSubjectFromVerifiedUser}=require('../_shared/apple-revocation.ts');
const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const env={APPLE_TEAM_ID:'TEAMFIXTURE',APPLE_KEY_ID:'KEYFIXTURE',APPLE_CLIENT_ID:'com.fixture.app',APPLE_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'})};
const now=1791532800;const get=name=>env[name];
function token(patch={}){return ['header',Buffer.from(JSON.stringify({iss:'https://appleid.apple.com',aud:'com.fixture.app',sub:'apple-subject',iat:now,exp:now+3600,...patch})).toString('base64url'),'signature'].join('.')}
test('Apple client secret is short-lived and has a valid ES256 signature',async()=>{
 const{secret}=await appleClientSecret(get,now);const[h,p,s]=secret.split('.');const claims=JSON.parse(Buffer.from(p,'base64url'));
 assert.equal(claims.sub,'com.fixture.app');assert.equal(claims.exp,now+300);assert.equal(claims.iss,'TEAMFIXTURE');
 assert.ok(crypto.verify('sha256',Buffer.from(h+'.'+p),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
});
test('Apple identity is resolved from verified provider identities only',()=>{
 assert.equal(appleSubjectFromVerifiedUser({identities:[{provider:'email'}],user_metadata:{provider:'apple'}}),null);
 assert.equal(appleSubjectFromVerifiedUser({identities:[{provider:'apple',identity_data:{sub:'verified'}}]}),'verified');
 assert.throws(()=>appleSubjectFromVerifiedUser({identities:[{provider:'apple'}]}));
});
test('missing Apple configuration fails before any network operation',async()=>{
 let calls=0;await assert.rejects(revokeAppleAuthorization({get:()=>undefined,expectedSubject:'apple-subject',authorizationCode:'code',fetcher:async()=>{calls++}}),/non configurée/);assert.equal(calls,0);
});
test('matching identity is revoked using the fresh refresh token with redirects disabled',async()=>{
 const calls=[];const result=await revokeAppleAuthorization({get,nowSeconds:now,expectedSubject:'apple-subject',authorizationCode:'code',fetcher:async(url,opts)=>{
  calls.push({url,opts});return url.endsWith('/token')?Response.json({id_token:token(),refresh_token:'fixture-refresh'}):new Response('',{status:200});
 }});assert.equal(result.revoked,true);assert.equal(calls.length,2);assert.equal(calls[1].opts.body.get('token'),'fixture-refresh');assert.equal(calls[1].opts.body.get('token_type_hint'),'refresh_token');assert.equal(calls[1].opts.redirect,'error');
});
for(const patch of [{sub:'other-user'},{aud:'other-app'},{iss:'https://attacker.invalid'},{exp:now-1}])test('mismatched Apple token cannot be revoked '+JSON.stringify(patch),async()=>{
 let calls=0;await assert.rejects(revokeAppleAuthorization({get,nowSeconds:now,expectedSubject:'apple-subject',authorizationCode:'code',fetcher:async()=>{calls++;return Response.json({id_token:token(patch),refresh_token:'fixture'})}}));assert.equal(calls,1);
});
test('Apple revocation failure is not reported as success and does not expose token details',async()=>{
 let calls=0;await assert.rejects(revokeAppleAuthorization({get,nowSeconds:now,expectedSubject:'apple-subject',authorizationCode:'code',fetcher:async()=>++calls===1?Response.json({id_token:token(),refresh_token:'sensitive-fixture'}):new Response('sensitive-fixture',{status:400})}),e=>!e.message.includes('sensitive-fixture')&&e.message.includes('pas confirmé'));
});
test('missing provider identities cannot silently bypass Apple revocation',()=>{
 assert.throws(()=>appleSubjectFromVerifiedUser({}),/indisponibles/);
});
test('trusted Apple metadata with incomplete identities fails closed',()=>{
 for(const app_metadata of [{provider:'apple'},{providers:['email','apple']}]) {
  assert.throws(()=>appleSubjectFromVerifiedUser({identities:[],app_metadata}),/Apple indisponible/);
 }
});
