<?php
declare(strict_types=1);
/** No clock/source/SQL effects: explicit callbacks make crash/retry tests reproducible. */
function labBackfillPlan(int $id,int $time,int $floor):array {
    if($floor<1||$id<$floor||$time<1000000000000)throw new RuntimeException('invalid_plan');
    return ['version'=>1,'status'=>'PAUSED','target'=>100000,'cutoffId'=>$id,'cutoffTime'=>$time,'floor'=>$floor,'upper'=>$id,'page'=>0,'previousId'=>$id+1,'previousTime'=>$time,'accepted'=>[],'examined'=>0,'nextAt'=>0,'coverage'=>'COMPLETENESS_UNVERIFIED'];
}
function labBackfillStep(array $state,callable $fetch,callable $store,int $now):array {
    if(!in_array($state['status'],['PAUSED','WAITING'],true)||$now<$state['nextAt'])return $state;
    $low=max($state['floor'],$state['upper']-999);
    $json=$fetch($low,$state['upper'],$state['page']);
    if(!is_array($json)||($json['number']??null)!==$state['page']||!is_bool($json['last']??null)||!is_array($json['content']??null)||!array_is_list($json['content'])||count($json['content'])>2)throw new RuntimeException('invalid_page');
    foreach($json['content'] as $r) {
        if(count($state['accepted'])>=100000)break;
        if(!is_array($r)||!is_int($r['draw_id']??null)||!is_int($r['draw_time_ms']??null)||$r['draw_id']<$low||$r['draw_id']>$state['upper']||$r['draw_time_ms']>$state['previousTime']||$r['draw_id']>=$state['previousId'])throw new RuntimeException('invalid_source_identity_or_order');
        $outcome=$store($r); // Idempotent kinoStore; checkpoint is never advanced before commit.
        if(!in_array($outcome,['inserted','unchanged'],true))throw new RuntimeException('revision_requires_review');
        $state['accepted'][(string)$r['draw_id']]=true;
        $state['previousId']=$r['draw_id'];$state['previousTime']=$r['draw_time_ms'];
        $state['examined']++;
    }
    if(count($state['accepted'])>=100000)$state['status']='COMPLETE';
    elseif($json['last']) {
        $state['upper']=$low-1;$state['page']=0;
        $state['status']=$state['upper']<$state['floor']?'INCOMPLETE':'PAUSED';
    }else {$state['page']++;$state['status']='PAUSED';}
    return $state;
}
function labSaveCheckpoint(string $path,array $state):void {
    $tmp=$path.'.tmp';$bytes=json_encode($state,JSON_THROW_ON_ERROR);
    if(strlen($bytes)>5000000||file_put_contents($tmp,$bytes,LOCK_EX)!==strlen($bytes)||!chmod($tmp,0600)||!rename($tmp,$path))throw new RuntimeException('checkpoint_failure');
}
