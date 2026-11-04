<?php
declare(strict_types=1);
require __DIR__.'/../private/backfill-core.php';
function assertBackfill(bool $ok,string $reason):void{if(!$ok)throw new RuntimeException($reason);}
$state=labBackfillPlan(2000,1793491200000,1);$writes=[];$calls=0;
$fetch=static function($lo,$hi,$page)use(&$calls){$calls++;return ['number'=>$page,'last'=>false,'content'=>[['draw_id'=>$hi,'draw_time_ms'=>1793491200000]]];};
$store=static function($r)use(&$writes){$id=$r['draw_id'];$exists=isset($writes[$id]);$writes[$id]=true;return $exists?'unchanged':'inserted';};
$next=labBackfillStep($state,$fetch,$store,100);
assertBackfill(count($next['accepted'])===1&&$next['page']===1,'progress');
// Crash after DB commit/before checkpoint: replaying the old state is safe/idempotent.
$replay=labBackfillStep($state,$fetch,$store,100);assertBackfill($replay===$next&&count($writes)===1,'crash_replay');
$next['nextAt']=200;$before=$calls;assertBackfill(labBackfillStep($next,$fetch,$store,199)===$next&&$calls===$before,'backoff');
$next['status']='PAUSED_BY_OPERATOR';assertBackfill(labBackfillStep($next,$fetch,$store,201)===$next&&$calls===$before,'paused');
$conflict=false;try{labBackfillStep($state,$fetch,static fn($r)=>'revision_pending',100);}catch(Throwable){$conflict=true;}assertBackfill($conflict,'revision_halts');
$bad=false;try{labBackfillStep($state,static fn()=>['number'=>0,'last'=>true,'content'=>[['draw_id'=>2001,'draw_time_ms'=>1793491200000]]],$store,100);}catch(Throwable){$bad=true;}assertBackfill($bad,'immutable_anchor');
$last=labBackfillPlan(10,1793491200000,1);
$last=labBackfillStep($last,static fn()=>['number'=>0,'last'=>true,'content'=>[]],$store,100);assertBackfill($last['status']==='INCOMPLETE','honest_exhaustion');
$path=sys_get_temp_dir().'/backfill-fixture-'.bin2hex(random_bytes(8)).'.json';labSaveCheckpoint($path,$next);assertBackfill(json_decode(file_get_contents($path),true)===$next,'checkpoint_roundtrip');unlink($path);
echo "BACKFILL_OFFLINE_PASS (zero network/DB)\n";

// Exercise the EXACT archived manager lock, not a reimplementation of it.
$private=sys_get_temp_dir().'/kino-lock-'.bin2hex(random_bytes(8));mkdir($private,0700);
foreach(['kino-engine.php','kino-sync-lib.php']as $name)copy(__DIR__.'/legacy/'.$name,$private.'/'.$name);
$lock=fopen($private.'/.kino-worker.lock','c');flock($lock,LOCK_EX);
$code='require '.var_export($private.'/kino-engine.php',true).';kinoLocked(static function(){echo "UNEXPECTED_WRITE";});';
$child=proc_open([PHP_BINARY,'-r',$code],[['pipe','r'],['pipe','w'],['pipe','w']],$pipes);
$output=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);$exit=proc_close($child);
flock($lock,LOCK_UN);fclose($lock);
assertBackfill($exit===0&&str_contains($output,'BUSY')&&!str_contains($output,'UNEXPECTED_WRITE'),'existing_cron_lock_preserved');
echo "LEGACY_MANAGER_LOCK_PASS\n";
