const fs=require('node:fs'),path=require('node:path');
const schema=require('./account-deletion-schema.json');
const quote=name=>'"'+name.replace(/"/g,'""')+'"';
async function installSchema(db){
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create table auth.users(id uuid primary key,deleted_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);
 create table auth.identities(user_id uuid references auth.users on delete cascade);create table storage.objects(owner uuid,owner_id text,name text,bucket_id text);`);
 const tables=[...new Set(schema.columns.map(c=>c.table))];
 for(const table of tables){const cols=schema.columns.filter(c=>c.table===table);const primary=cols.some(c=>c.name==='id')?'id':table==='provider_profiles'?'provider_id':null;
  await db.exec(`create table public.${quote(table)} (${cols.map(c=>`${quote(c.name)} ${c.type}${c.nullable?'':' not null'}${c.generated?' generated always as ('+c.default+') stored':c.default?' default '+c.default:''}${c.name===primary?' primary key':''}`).join(',')})`);
 }
 for(const fk of schema.foreignKeys)await db.exec(`alter table public.${quote(fk.table)} add constraint ${quote(fk.name)} ${fk.definition}`);
}
async function migration(db,name){await db.exec(fs.readFileSync(path.join(__dirname,'../../migrations',name),'utf8'));}
module.exports={installSchema,migration};
