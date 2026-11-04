<?php
declare(strict_types=1);
require __DIR__.'/../private/backfill-core.php';
require __DIR__.'/../private/backfill-transport.php';
require __DIR__.'/../private/lab-service.php';
$failed=[];
if(labNextSourceAt(100.999,1000)!==102||labNextSourceAt(100.001,1500)!==102)$failed[]='fractional_source_spacing';
$rate=tmpfile();
if(!labReadAdmission($rate,100.999))$failed[]='initial_read_admission';rewind($rate);
if(labReadAdmission($rate,102.000))$failed[]='fractional_read_spacing';rewind($rate);
if(!labReadAdmission($rate,103.000))$failed[]='eligible_read_admission';fclose($rate);
$state=labBackfillPlan(2000,1793491200000,1);
$row=['draw_id'=>2000,'draw_time_ms'=>1793491200000];
foreach([
    'contradictory_last_flag'=>['number'=>0,'last'=>true,'first'=>true,'size'=>2,'totalElements'=>10,'totalPages'=>5,'numberOfElements'=>1,'content'=>[$row]],
    'empty_nonterminal_page'=>['number'=>0,'last'=>false,'first'=>true,'size'=>2,'totalElements'=>10,'totalPages'=>5,'numberOfElements'=>0,'content'=>[]],
]as $name=>$page){
    $writes=0;$rejected=false;
    try{labBackfillStep($state,static fn()=>$page,static function()use(&$writes){$writes++;return 'inserted';},100);}catch(Throwable){$rejected=true;}
    if(!$rejected||$writes!==0)$failed[]=$name;
}
$page=['number'=>0,'last'=>true,'first'=>true,'size'=>2,'totalElements'=>2,'totalPages'=>1,'numberOfElements'=>2,'content'=>[$row,['draw_id'=>2001,'draw_time_ms'=>1793491200000]]];
$writes=0;try{labBackfillStep($state,static fn()=>$page,static function()use(&$writes){$writes++;return 'inserted';},100);}catch(Throwable){}
if($writes!==0)$failed[]='invalid_second_row_partially_written';
foreach(['page','target','previousId','nextAt']as $key){$bad=$state;$bad[$key]=-1;$calls=0;$reject=false;try{labBackfillStep($bad,static function()use(&$calls){$calls++;return [];},static fn()=>'inserted',100);}catch(Throwable){$reject=true;}if(!$reject||$calls!==0)$failed[]='corrupt_checkpoint_'.$key;}
$waiting=$state;$waiting['status']='WAITING';$waiting['nextAt']=1000;
$resumed=labBackfillControl(labBackfillControl($waiting,'pause'),'resume');
if($resumed['status']!=='WAITING'||$resumed['nextAt']!==1000)$failed[]='cooldown_lost';
if(labRetryAfter('120',100)!==120||labRetryAfter(gmdate('D, d M Y H:i:s \G\M\T',220),100)!==120)$failed[]='retry_after';
foreach(['9223372036854775807','not-a-date']as $value){$reject=false;try{labRetryAfter($value,100);}catch(Throwable){$reject=true;}if(!$reject)$failed[]='unbounded_retry_header';}
// Actual CLI control flow, exact archived writer; only the clock is frozen in this
// disposable copy. No DB config, network, source fetch or production files exist.
$private=sys_get_temp_dir().'/kino-review-'.bin2hex(random_bytes(8));mkdir($private,0700);
foreach(['backfill-core.php','backfill-transport.php']as $name)copy(__DIR__.'/../private/'.$name,$private.'/'.$name);
foreach(['kino-engine.php','kino-sync-lib.php']as $name)copy(__DIR__.'/legacy/'.$name,$private.'/'.$name);
$cli=file_get_contents(__DIR__.'/../private/lab-backfill.php');
$cli=str_replace('$untilSlot=300-(time()%300);','$untilSlot=100;',$cli);
file_put_contents($private.'/lab-backfill.php',$cli);
$cfg=['enabled'=>true,'source_policy_verified'=>true,'operational_approval'=>true,'schema_verified'=>true,'source_policy_reference'=>'OFFLINE_SYNTHETIC_APPROVAL_ONLY','verified_oldest_id'=>1,'verified_min_spacing_ms'=>1000];
file_put_contents($private.'/backfill-config.php','<?php return '.var_export($cfg,true).';');
$state['status']='REVIEW_REQUIRED';$path=$private.'/.lab-backfill-state.json';labSaveCheckpoint($path,$state);
foreach(['pause','resume']as $command){
    $child=proc_open([PHP_BINARY,$private.'/lab-backfill.php',$command,'--approved-commit'],[['pipe','r'],['pipe','w'],['pipe','w']],$pipes);
    stream_get_contents($pipes[1]);stream_get_contents($pipes[2]);proc_close($child);
}
$loaded=json_decode(file_get_contents($path),true,32,JSON_THROW_ON_ERROR);
if($loaded['status']!=='REVIEW_REQUIRED')$failed[]='manual_review_bypass_via_pause_resume';
echo json_encode(['status'=>$failed?'FAIL':'PASS','findings'=>$failed,'network'=>'none'],JSON_THROW_ON_ERROR)."\n";
exit($failed?1:0);
