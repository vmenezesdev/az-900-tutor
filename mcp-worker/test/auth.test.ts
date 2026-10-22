import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {env} from 'cloudflare:workers';
import {applyD1Migrations} from 'cloudflare:test';
import {authRoute,type Env} from '../src/auth';

const testEnv=env as unknown as Env & {TEST_MIGRATIONS:any[]};
const base='https://tutor.example.test';
const clientId='https://client.example.test/metadata.json';
const callback='https://client.example.test/callback';
const document={client_id:clientId,client_name:'Synthetic CIMD client',redirect_uris:[callback]};
function authorize(id=clientId,redirect=callback){
 const params=new URLSearchParams({client_id:id,redirect_uri:redirect,response_type:'code',state:'synthetic-test',code_challenge:'a'.repeat(43),code_challenge_method:'S256',resource:`${base}/mcp`});
 return authRoute(new Request(`${base}/authorize?${params}`),testEnv,'/authorize');
}
beforeAll(async()=>{await applyD1Migrations(testEnv.DB,testEnv.TEST_MIGRATIONS)});
afterEach(async()=>{
 vi.unstubAllGlobals();
 await testEnv.DB.prepare('DELETE FROM oauth_transactions').run();
 await testEnv.DB.prepare('DELETE FROM oauth_clients').run();
});

describe('local OAuth admission with synthetic client metadata',()=>{
 it('fetches and caches valid CIMD in D1, reaching the Google redirect',async()=>{
  const fetcher=vi.fn(async()=>Response.json(document));vi.stubGlobal('fetch',fetcher);
  const first=await authorize();expect(first?.status).toBe(302);
  expect(new URL(first!.headers.get('location')!).origin).toBe('https://accounts.google.com');
  const stored:any=await testEnv.DB.prepare('SELECT * FROM oauth_clients WHERE client_id=?').bind(clientId).first();
  expect(JSON.parse(stored.redirect_uris)).toEqual([callback]);expect(stored.metadata_refresh_after).toBeGreaterThan(Date.now());
  expect((await authorize())?.status).toBe(302);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('reproduces the reported generic error when metadata retrieval throws',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('synthetic network failure')}));
  const response=await authorize();expect(response?.status).toBe(400);
  expect(await response!.json()).toEqual({error:'invalid_client',error_description:'Client metadata retrieval or validation failed'});
  expect(await testEnv.DB.prepare('SELECT id FROM oauth_transactions').first()).toBeNull();
 });
 it('reproduces the same error when a successful HTTP response is not JSON',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>synthetic response</html>',{headers:{'content-type':'text/html'}})));
  const response=await authorize();expect(response?.status).toBe(400);
  expect(await response!.json()).toEqual({error:'invalid_client',error_description:'Client metadata retrieval or validation failed'});
 });
 it('rejects a CIMD identity mismatch without starting Google authorization',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...document,client_id:'https://other.example.test/metadata.json'})));
  const response=await authorize();expect(response?.status).toBe(400);
  expect(await response!.json()).toEqual({error:'invalid_client',error_description:'Client metadata document is invalid'});
 });
 it('rejects callbacks absent from the published metadata',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(document)));
  const response=await authorize(clientId,'https://other.example.test/callback');expect(response?.status).toBe(400);
  expect(await response!.json()).toEqual({error:'invalid_client',error_description:'Client or redirect is not registered'});
 });
 it('reaches the Google redirect through DCR without a metadata fetch',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const registration=await authRoute(new Request(`${base}/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Synthetic DCR client',redirect_uris:[callback],grant_types:['authorization_code'],token_endpoint_auth_method:'none'})}),testEnv,'/register');
  expect(registration?.status).toBe(201);const registered:any=await registration!.json();
  const response=await authorize(registered.client_id);expect(response?.status).toBe(302);
  expect(new URL(response!.headers.get('location')!).origin).toBe('https://accounts.google.com');expect(fetcher).not.toHaveBeenCalled();
 });
});
