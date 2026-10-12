// Fera AI V2 companion verification. Authors: Sadman Shaharier; Obidit Islam.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const db=new PGlite({extensions:{vector}});
const results=[];
const q=async sql=>(await db.query(sql)).rows;
const engine=(await q('select version() as version'))[0].version;
await db.exec(readFileSync(root+'/code/schema_v2.sql','utf8'));
const extension=(await q("select extversion from pg_extension where extname='vector'"))[0].extversion;
const u=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const lit=n=>`'${u(n)}'`;
const m=lit(10), m2=lit(11), f=lit(20), f2=lit(21), c=lit(30), officer=lit(3), admin=lit(4), draft=lit(5);
await db.exec(`
INSERT INTO districts VALUES(1,'Dhaka','ঢাকা','Dhaka',23.8,90.4);
INSERT INTO users(id,username,display_name,password_hash,role,verified) VALUES
(${lit(1)},'staff','Test staff','synthetic-test-only','staff',false),
(${officer},'officer','Test officer','synthetic-test-only','officer',true),
(${admin},'admin','Test admin','synthetic-test-only','admin',false),
(${lit(6)},'unverified','Unverified officer','synthetic-test-only','officer',false);
INSERT INTO parent_sessions(id) VALUES(${lit(2)});
INSERT INTO intake_drafts(id,session_id,kind) VALUES(${draft},${lit(2)},'missing');
INSERT INTO cases(id,ref_code,kind,status,source,age_years,age_min,age_max,event_at,event_at_lower,event_at_upper,district_code,contact_phone,place_text,reporter_session_id,client_submission_id,submission_payload_hash) VALUES
(${m},'M-000001','missing','submitted','parent',9,9,9,now()-interval '2 days',now()-interval '2 days',now()-interval '2 days',1,'01712345678','Synthetic station',${lit(2)},${lit(100)},repeat('a',64)),
(${m2},'M-000002','missing','submitted','parent',9,9,9,now()-interval '2 days',now()-interval '2 days',now()-interval '2 days',1,'01712345678','Synthetic station',${lit(2)},${lit(101)},repeat('b',64));
UPDATE cases SET status='open' WHERE kind='missing';
INSERT INTO cases(id,ref_code,kind,status,source,age_years,age_min,age_max,event_at,event_at_lower,event_at_upper,district_code,contact_phone,place_text,circumstances,created_by_user_id,client_submission_id,submission_payload_hash) VALUES
(${f},'F-000001','found','open','staff',9,9,9,now()-interval '1 day',now()-interval '1 day',now()-interval '1 day',1,'01712345678','Synthetic shelter','Synthetic child accompanied by staff',${lit(1)},${lit(102)},repeat('c',64)),
(${f2},'F-000002','found','open','staff',NULL,NULL,NULL,now()-interval '1 day',now()-interval '1 day',now()-interval '1 day',1,'01712345678','Synthetic shelter','Synthetic child; age unknown',${lit(1)},${lit(103)},repeat('d',64));
INSERT INTO match_candidates(id,missing_case_id,found_case_id,missing_version,found_version,score,rank,reason_bn,reason_en,components)
VALUES(${c},${m},${f},1,1,75,1,'পরীক্ষা','Synthetic test','{}');
UPDATE cases SET status='matched_pending_review' WHERE id IN (${m},${f});
INSERT INTO audit_log(actor_type,action) VALUES('system','test.event');
`);
async function check(name,expected,body){
  await db.exec('BEGIN'); let actual='accepted',error=null;
  try { if(typeof body==='function') await body(); else await db.exec(body); await db.exec('SET CONSTRAINTS ALL IMMEDIATE'); }
  catch(e){actual='rejected';error={code:e.code??null,message:e.message};}
  await db.exec('ROLLBACK');
  const result={name,expected,actual,pass:actual===expected,error};results.push(result);console.log(JSON.stringify(result));
}
const confirm=(audit=true,wrong=false)=>`
UPDATE match_candidates SET status='confirmed',decided_at=now() WHERE id=${c};
INSERT INTO review_decisions(candidate_id,officer_id,decision,reason) VALUES(${c},${officer},'confirm','Synthetic review');
INSERT INTO referrals(candidate_id,missing_case_id,found_case_id,referred_by,note)
VALUES(${c},${wrong?m2:m},${wrong?f2:f},${officer},'Synthetic sensitive note 01712345678');
UPDATE cases SET status='confirmed' WHERE id=${m};
UPDATE cases SET status='referred',closed_at=now() WHERE id=${f};
${audit?`INSERT INTO audit_log(actor_type,actor_user_id,action,case_id,candidate_id) VALUES('officer',${officer},'match.confirm',${m},${c});`:''}
`;
await check('Positive complete synthetic seed, unknown found age and shared-phone siblings','accepted',async()=>{
 const rows=await q(`select count(*)::int as count from cases where contact_phone='01712345678'`);if(rows[0].count!==4)throw Error('Shared phone hid cases');
});
await check('Missing required report fields','rejected',`INSERT INTO cases(ref_code,kind,status,source) VALUES('M-000003','missing','submitted','parent')`);
await check('Invalid initial confirmed status','rejected',`INSERT INTO cases(ref_code,kind,status,source) SELECT 'M-000003',kind,'confirmed',source FROM cases WHERE id=${m}`);
await check('Incomplete age range','rejected',`UPDATE cases SET age_max=NULL WHERE id=${m}`);
await check('Inconsistent exact age','rejected',`UPDATE cases SET age_years=8 WHERE id=${m}`);
await check('Future exact event','rejected',`UPDATE cases SET event_at=now()+interval '1 year',event_at_lower=now()+interval '1 year',event_at_upper=now()+interval '1 year' WHERE id=${m}`);
await check('Wrong case kind state','rejected',`UPDATE cases SET status='closed',closed_at=now(),outcome='coordination_recorded' WHERE id=${f}`);
await check('Case kind mutation','rejected',`UPDATE cases SET kind='found',ref_code='F-000099' WHERE id=${m}`);
await check('Non-synthetic flag rejected','rejected',`UPDATE cases SET is_synthetic=false WHERE id=${m}`);
await check('Swapped candidate endpoint kinds','rejected',`INSERT INTO match_candidates(missing_case_id,found_case_id,missing_version,found_version,score,rank,reason_bn,reason_en,components) VALUES(${f2},${m2},1,1,70,1,'পরীক্ষা','Test','{}')`);
await check('Stale pending candidate after report edit','rejected',`UPDATE cases SET version=2 WHERE id=${m}`);
await check('Pending-review status without candidate','rejected',`UPDATE cases SET status='matched_pending_review' WHERE id=${m2}`);
await check('Verified rejection with NULL reason','rejected',`INSERT INTO review_decisions(candidate_id,officer_id,decision,reason) VALUES(${c},${officer},'reject',NULL)`);
await check('Unverified decision author','rejected',`INSERT INTO review_decisions(candidate_id,officer_id,decision,reason) VALUES(${c},${lit(6)},'reject','Synthetic rejection')`);
await check('Staff decision author','rejected',`INSERT INTO review_decisions(candidate_id,officer_id,decision,reason) VALUES(${c},${lit(1)},'reject','Synthetic rejection')`);
await check('Confirmed case without decision/referral','rejected',`UPDATE cases SET status='confirmed' WHERE id=${m}`);
await check('Referral endpoints unrelated to candidate','rejected',confirm(true,true));
await check('Decision without matching audit event','rejected',confirm(false));
await check('Positive atomic pair confirmation with audit and simulated referral','accepted',confirm());
await check('Positive rejection, reason, audit and reopen both cases','accepted',`
UPDATE match_candidates SET status='rejected',decided_at=now() WHERE id=${c};
INSERT INTO review_decisions(candidate_id,officer_id,decision,reason) VALUES(${c},${officer},'reject','Synthetic mismatch');
INSERT INTO audit_log(actor_type,actor_user_id,action,candidate_id) VALUES('officer',${officer},'match.reject',${c});
UPDATE cases SET status='open' WHERE id IN(${m},${f});`);
await check('Terminal report detail edit','rejected',confirm()+`UPDATE cases SET child_name='Changed after confirmation' WHERE id=${m};`);
await check('Confirmed candidate score rewrite','rejected',confirm()+`UPDATE match_candidates SET score=99 WHERE id=${c};`);
await check('Confirmed candidate deletion','rejected',confirm()+`DELETE FROM match_candidates WHERE id=${c};`);
await check('Referral history deletion','rejected',confirm()+`DELETE FROM referrals WHERE candidate_id=${c};`);
await check('Referral author rewrite','rejected',confirm()+`UPDATE referrals SET referred_by=${admin} WHERE candidate_id=${c};`);
await check('Review decision history deletion','rejected',confirm()+`DELETE FROM review_decisions WHERE candidate_id=${c};`);
await check('Found evidence redaction before linked missing closure','rejected',confirm()+`SELECT redact_case(${f},${admin});`);
await check('Positive full related-payload redaction after closure','accepted',async()=>{
 await db.exec(confirm()+`
 UPDATE cases SET status='closed',closed_at=now(),outcome='coordination_recorded',outcome_note='Synthetic sensitive note' WHERE id=${m};
 INSERT INTO case_versions(case_id,version,snapshot,edited_by) VALUES(${m},1,'{"child_name":"Synthetic child"}','parent');
 INSERT INTO generated_outputs(case_id,type,text_bn,case_version) VALUES(${m},'gd','Synthetic sensitive output',1);
 SELECT redact_case(${m},${admin}); SELECT redact_case(${f},${admin});`);
 const r=(await q(`SELECT child_name_latin,age_years,outcome_note,reporter_session_id,created_by_user_id,source_url,provenance,anonymised_at FROM cases WHERE id=${m}`))[0];
 if(Object.entries(r).some(([k,v])=>k!=='provenance'&&k!=='anonymised_at'&&v!==null)||!r.anonymised_at||Object.keys(r.provenance).length)throw Error('Case payload retained');
 const extras=(await q(`SELECT (SELECT count(*) FROM generated_outputs WHERE case_id=${m})::int AS outputs,(SELECT count(*) FROM case_versions WHERE case_id=${m} AND snapshot IS NOT NULL)::int AS versions,(SELECT count(*) FROM referrals WHERE candidate_id=${c} AND note IS NOT NULL)::int AS referrals,(SELECT reason FROM review_decisions WHERE candidate_id=${c}) AS reason`))[0];
 if(extras.outputs||extras.versions||extras.referrals||extras.reason!=='[REDACTED]')throw Error('Related payload retained');
});
await check('Audit update','rejected',`UPDATE audit_log SET action='changed.event'`);
await check('Audit delete','rejected',`DELETE FROM audit_log`);
await check('Audit truncate even for schema owner','rejected',`TRUNCATE audit_log`);
await check('Unknown resource denial logged without foreign-key leak','accepted',`INSERT INTO audit_log(actor_type,action,case_id,details) VALUES('parent','access.denied',NULL,'{"resource":"unknown"}')`);
await check('Parent submission UUID uniqueness','rejected',`INSERT INTO cases(ref_code,kind,status,source,age_min,age_max,event_at,event_at_lower,event_at_upper,district_code,contact_phone,place_text,reporter_session_id,client_submission_id,submission_payload_hash) SELECT 'M-000003',kind,'submitted',source,age_min,age_max,event_at,event_at_lower,event_at_upper,district_code,contact_phone,place_text,reporter_session_id,client_submission_id,submission_payload_hash FROM cases WHERE id=${m}`);
await check('Staff submission UUID uniqueness','rejected',`INSERT INTO cases(ref_code,kind,status,source,age_min,age_max,event_at,event_at_lower,event_at_upper,district_code,contact_phone,place_text,circumstances,created_by_user_id,client_submission_id,submission_payload_hash) SELECT 'F-000003',kind,'open',source,age_min,age_max,event_at,event_at_lower,event_at_upper,district_code,contact_phone,place_text,circumstances,created_by_user_id,client_submission_id,submission_payload_hash FROM cases WHERE id=${f}`);
await check('Staff submission missing UUID/hash','rejected',`UPDATE cases SET client_submission_id=NULL,submission_payload_hash=NULL WHERE id=${f2}`);
await check('Phone-only duplicate cannot confirm same child','rejected',`INSERT INTO duplicate_links(case_a,case_b,score,rule,status,resolved_by,resolved_at) VALUES(${m},${m2},99,'same_phone','confirmed_same',${officer},now())`);
await check('Positive profile duplicate resolution','accepted',`INSERT INTO duplicate_links(case_a,case_b,score,rule,status,resolved_by,resolved_at,reason) VALUES(${m},${m2},90,'profile','confirmed_same',${officer},now(),'Reviewed synthetic profile evidence')`);
await check('Duplicate resolution requires reason','rejected',`INSERT INTO duplicate_links(case_a,case_b,score,rule,status,resolved_by,resolved_at) VALUES(${m},${m2},90,'profile','confirmed_same',${officer},now())`);
await check('Opposite-kind duplicate','rejected',`INSERT INTO duplicate_links(case_a,case_b,score,rule) VALUES(${m},${f},90,'profile')`);
await check('Embedding dimensions','rejected',`UPDATE cases SET embedding='[0.1,0.2,0.3]' WHERE id=${m}`);
await check('Embedding must identify its vector space','rejected',`UPDATE cases SET embedding='[${Array(384).fill(0.01).join(',')}]' WHERE id=${m}`);
await check('Positive six paid calls and idempotent settlement','accepted',async()=>{
 let first;
 for(let i=0;i<6;i++){const r=(await q(`select reserve_ai_call(${draft},1) as id`))[0];first??=r.id;}
 await db.exec(`select settle_ai_call('${first}',0.5);select settle_ai_call('${first}',0.5);`);
 const count=(await q(`select ai_calls_used from intake_drafts where id=${draft}`))[0].ai_calls_used;
 const b=(await q('select committed_usd,reserved_usd from ai_budget'))[0];
 if(count!==6||Number(b.committed_usd)!==0.5||Number(b.reserved_usd)!==5)throw Error('Counter/settlement incorrect');
});
await check('Seventh paid call','rejected',`SELECT reserve_ai_call(${draft},1) FROM generate_series(1,7)`);
await check('Global cost cap','rejected',`SELECT reserve_ai_call(${draft},26)`);
await check('Expired draft reservation','rejected',`UPDATE intake_drafts SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=${draft}; SELECT reserve_ai_call(${draft},1)`);
await check('Settlement cannot exceed reservation','rejected',`SELECT settle_ai_call(reserve_ai_call(${draft},1),2)`);
await check('Conflicting repeat settlement including NULL','rejected',async()=>{
 const id=(await q(`select reserve_ai_call(${draft},1) as id`))[0].id;
 await db.exec(`select settle_ai_call('${id}',0.5);select settle_ai_call('${id}',NULL);`);
});
await check('Positive standalone outside-Fera closure after candidate invalidation','accepted',`
UPDATE match_candidates SET status='voided',decided_at=now() WHERE id=${c};
UPDATE cases SET status='open' WHERE id IN (${m},${f});
UPDATE cases SET status='closed',closed_at=now(),outcome='resolved_outside_fera' WHERE id=${m};`);
const output={scope:'Companion schema only; not deployed application/API verification',engine,extension,targetEngine:'PostgreSQL 16 + pgvector >=0.8.1: CI not yet run',checks:results,total:results.length,passed:results.filter(r=>r.pass).length,allPassed:results.every(r=>r.pass)};
mkdirSync(root+'/verification',{recursive:true});
writeFileSync(root+'/verification/schema_checks.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({total:output.total,passed:output.passed,engine,extension}));
await db.close();if(!output.allPassed)process.exitCode=1;
