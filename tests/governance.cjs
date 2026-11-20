'use strict';
const assert = require('node:assert/strict'), { DatabaseSync } = require('node:sqlite'),
  fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const rules = require('../lib/governance.cjs'), acceptance = require('../lib/policy-acceptance.cjs'),
  retention = require('../lib/retention-review.cjs');
const db = new DatabaseSync(':memory:');
try {
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY,terms_version TEXT,terms_accepted_at TEXT)');
  db.prepare('INSERT INTO users VALUES(?,?,?)').run(1,'2026-10-13-potypet-rc6-revisao','2026-10-13T10:00:00Z');
  const old = db.prepare('SELECT * FROM users WHERE id=1').get(), service=acceptance({db, version:rules.version});
  assert.equal(service.status(old).accepted,false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM policy_acceptances').get().n,0,'A leitura não cria aceite.');
  assert.throws(()=>service.accept(old,{ version:rules.version,accepted:false }));
  assert.throws(()=>service.accept(old,{ version:'antiga',accepted:true }));
  assert.throws(()=>service.accept(old,null),(error)=>error.status===400);
  assert.equal(service.accept(old,{ version:rules.version,accepted:true }).accepted,true);
  const first=service.status(old).acceptedAt;
  assert.equal(service.accept(old,{ version:rules.version,accepted:true }).acceptedAt,first,'Repetição conserva data original.');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM policy_acceptances').get().n,1);
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=1').get(),old,'Aceite anterior preservado.');
} finally { db.close(); }

const collections={
  requests:[{ id:1,status:'pendente',createdAt:'2020-01-01' },
    {id:2,status:'concluida',completedAt:'2024-01-01',name:'NÃO DIVULGAR'},
    {id:3,status:'reprovada',rejectedAt:'2024-01-01'},
    {id:4,status:'cancelada',canceledAt:'2024-01-01'},
    {id:5,status:'concluida',createdAt:'2020-01-01'}],
  reports:[{id:8,status:'resolvida',resolvedAt:'2024-01-01',message:'NÃO DIVULGAR'}],
  adminLog:[{id:9,createdAt:'2026-01-01'}],
};
const original=JSON.stringify(collections), report=retention((key)=>collections[key],new Date('2026-11-19T00:00:00Z'));
assert.deepEqual(report.candidates.map((x)=>x.id),[2,3,4,8]);
assert.equal(report.missingClosureDate.requests,1);
assert.equal(JSON.stringify(collections),original);assert.equal(report.automaticDeletion,false);
assert.ok(!JSON.stringify(report).includes('NÃO DIVULGAR'));

function page({accepted=false,historical=false}={}) {
  const elements = new Map(), calls=[];
  const element=()=>({ disabled:false,checked:false,hidden:false,textContent:'',listeners:{},
    setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.listeners[name]=fn;},
    querySelector(id){return elements.get(id.slice(1));} });
  for(const id of ['policy-update-confirm','policy-update-save','policy-update-status']) elements.set(id,element());
  elements.get('policy-update-save').disabled=true;
  const main={prepend(x){elements.set(x.id,x);}};
  const context=vm.createContext({ document:{ querySelector:()=>main,getElementById:(id)=>elements.get(id),createElement:()=>element() },
    Auth:{getCurrentUser:()=>({id:1,historicalAccess:historical})},
    apiRequestAsync:async(method,url,body)=>{calls.push({method,url,body});return {policy:{version:rules.version,accepted:true}};} });
  const source=fs.readFileSync(path.join(__dirname,'../js/app-runtime.js'),'utf8').split('\nApp.ready(')[0];
  vm.runInContext(source+'\nglobalThis.testApp=App;',context);
  const app=context.testApp;app.data.session={policy:{ version:rules.version,accepted }};
  app.showPolicyNotice();
  return {app,elements,calls};
}
(async()=>{
  const p=page(), confirm=p.elements.get('policy-update-confirm'),save=p.elements.get('policy-update-save');
  assert.equal(p.calls.length,0);assert.ok(p.elements.has('policy-update-notice'));
  await save.listeners.click();assert.equal(p.calls.length,0,'Clique sem confirmação não registra.');
  confirm.checked=true;confirm.listeners.change();await save.listeners.click();
  assert.equal(p.calls.length,1);assert.equal(p.calls[0].url,'/api/account/policy-acceptance');
  assert.equal(p.calls[0].body.version,rules.version);assert.equal(p.calls[0].body.accepted,true);
  assert.equal(p.app.data.session.policy.accepted,true);
  assert.equal(page({accepted:true}).elements.has('policy-update-notice'),false);
  assert.equal(page({historical:true}).elements.has('policy-update-notice'),false);
  console.log('OK governança — versão/aceite explícito, original preservado, idempotência, interface sem aceite automático e retenção somente leitura sem exposição de conteúdo');
})().catch((error)=>{console.error(error);process.exitCode=1;});
