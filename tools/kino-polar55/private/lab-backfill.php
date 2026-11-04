<?php
declare(strict_types=1);
require_once __DIR__.'/backfill-core.php';
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
// Inspect/dry-run makes ZERO source/DB requests, unlike the old manager history preview.
$path=__DIR__.'/.lab-backfill-state.json';
$command=$argv[1]??'inspect';
if($command==='inspect') {
    try{$state=labLoadCheckpoint($path);}catch(Throwable){fwrite(STDERR,"BACKFILL_BLOCKED: invalid checkpoint; preserve for review\n");exit(1);}
    echo json_encode(['mode'=>'DISABLED_UNLESS_SEPARATELY_APPROVED','status'=>$state['status']??'NOT_STARTED','accepted'=>$state?count($state['accepted']):0,'target'=>100000,'nextAt'=>$state['nextAt']??null],JSON_THROW_ON_ERROR)."\n";exit;
}
try {
    if(!in_array($command,['start','step','pause','resume'],true)||($argv[2]??'')!=='--approved-commit')throw new RuntimeException('explicit_commit_required');
    $cfg=require __DIR__.'/backfill-config.php';
    foreach(['enabled','source_policy_verified','operational_approval','schema_verified']as $flag)if(($cfg[$flag]??false)!==true)throw new RuntimeException('activation_not_approved');
    if(!is_string($cfg['source_policy_reference']??null)||strlen($cfg['source_policy_reference'])<10||!is_int($cfg['verified_oldest_id']??null)||$cfg['verified_oldest_id']<1||!is_int($cfg['verified_min_spacing_ms']??null)||$cfg['verified_min_spacing_ms']<1000)throw new RuntimeException('source_contract_missing');
    // Refuse unreviewed variants of the existing writer/lock implementation.
    foreach(['kino-engine.php'=>'8e27074c6be2bb0d6cae33799ddb1c749f7d191805f8bc93ea81c3c9bbf17099','kino-sync-lib.php'=>'b7d9f37ea4baca2ed16ad521c998c70e3bcba26e364dd5c46f9031350593d44b']as $file=>$hash)if(!is_file(__DIR__.'/'.$file)||!hash_equals($hash,hash_file('sha256',__DIR__.'/'.$file)))throw new RuntimeException('deployed_writer_not_verified');
    require_once __DIR__.'/kino-engine.php';
    // Never delay the existing five-minute cron. Yield near its scheduled slot.
    $untilSlot=300-(time()%300);if($untilSlot<35||$untilSlot>265)throw new RuntimeException('yield_to_incremental');
    kinoLocked(static function()use($command,$path,$cfg):void {
        $state=labLoadCheckpoint($path);
        if($command==='start') {
            if($state!==null)throw new RuntimeException('existing_checkpoint_must_be_preserved');
            $envelope=kinoGet(KINO_BASE.'last-result-and-active');
            if(!is_array($envelope['last']??null))throw new RuntimeException('missing_anchor');
            $anchor=kinoNormalize($envelope['last'],KINO_BASE.'last-result-and-active');
            $state=labBackfillPlan($anchor['draw_id'],$anchor['draw_time_ms'],$cfg['verified_oldest_id']);
            $state['nextAt']=labNextSourceAt(microtime(true),$cfg['verified_min_spacing_ms']);
            labSaveCheckpoint($path,$state);return;
        }
        if(!is_array($state))throw new RuntimeException('missing_checkpoint');
        if(in_array($command,['pause','resume'],true)){labSaveCheckpoint($path,labBackfillControl($state,$command));return;}
        if(!in_array($state['status'],['PAUSED','WAITING'],true)||time()<$state['nextAt'])return;
        require_once __DIR__.'/backfill-transport.php';
        $db=kinoDb();
        $db->exec('SET SESSION innodb_lock_wait_timeout=2');
        $db->exec('SET SESSION max_statement_time=2');
        try {
            $state=labBackfillStep($state,static function(int $lo,int $hi,int $page):array {
                $url=KINO_BASE.'draw-id/'.$lo.'/'.$hi.'?limit=2&page='.$page;
                $json=labRangeGet($lo,$hi,$page);
                if(!is_array($json['content']??null))throw new RuntimeException('invalid_page');
                $json['content']=array_map(static fn($r)=>kinoNormalize($r,$url),$json['content']);
                return $json;
            },static fn($r)=>kinoStore($db,$r),time());
            $state['failures']=0;
            $state['nextAt']=labNextSourceAt(microtime(true),$cfg['verified_min_spacing_ms']);
        }catch(LabSourceRetry $e) {
            $state['failures']=($state['failures']??0)+1;
            $state['status']=$state['failures']>=3?'REVIEW_REQUIRED':'WAITING';
            $state['nextAt']=(int)ceil(microtime(true))+max($e->retryAfter,30*(2**$state['failures']))+random_int(0,10);
        }catch(Throwable) {$state['status']='REVIEW_REQUIRED';}
        labSaveCheckpoint($path,$state);
        echo json_encode(['status'=>$state['status'],'accepted'=>count($state['accepted']),'target'=>$state['target'],'nextAt'=>$state['nextAt']],JSON_THROW_ON_ERROR)."\n";
    });
}catch(Throwable){fwrite(STDERR,"BACKFILL_BLOCKED: activation/source/schema/transport verification required\n");exit(1);}
