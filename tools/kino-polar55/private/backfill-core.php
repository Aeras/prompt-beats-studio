<?php
declare(strict_types=1);
/** No clock/source/SQL effects: explicit callbacks make crash/retry tests reproducible. */
function labNextSourceAt(float $now,int $spacingMs):int {
    $next=ceil($now+$spacingMs/1000);
    if(!is_finite($now)||$now<0||$spacingMs<1000||$next>=PHP_INT_MAX)throw new RuntimeException('invalid_source_spacing');
    return (int)$next;
}
function labBackfillPlan(int $id,int $time,int $floor):array {
    if($floor<1||$id<$floor||$time<1000000000000)throw new RuntimeException('invalid_plan');
    return ['version'=>1,'status'=>'PAUSED','target'=>100000,'cutoffId'=>$id,'cutoffTime'=>$time,'floor'=>$floor,'upper'=>$id,'page'=>0,'rangeTotal'=>null,'previousId'=>$id+1,'previousTime'=>$time,'accepted'=>[],'examined'=>0,'nextAt'=>0,'coverage'=>'COMPLETENESS_UNVERIFIED'];
}
function labAssertCheckpoint(array $s):void {
    foreach(['cutoffId','cutoffTime','floor','upper','page','previousId','previousTime','examined','nextAt']as $key)if(!is_int($s[$key]??null))throw new RuntimeException('checkpoint_invalid');
    if(($s['version']??null)!==1||($s['target']??null)!==100000||($s['coverage']??null)!=='COMPLETENESS_UNVERIFIED'||!in_array($s['status']??null,['PAUSED','WAITING','PAUSED_BY_OPERATOR','COMPLETE','INCOMPLETE','REVIEW_REQUIRED'],true)||!is_array($s['accepted']??null))throw new RuntimeException('checkpoint_invalid');
    if($s['cutoffId']<1||$s['cutoffId']>=9007199254740991||$s['cutoffTime']<1000000000000||$s['cutoffTime']>=4100000000000||$s['floor']<1||$s['floor']>$s['cutoffId']||$s['upper']<$s['floor']-1||$s['upper']>$s['cutoffId']||$s['page']<0||$s['page']>499||$s['nextAt']<0||$s['previousTime']<1000000000000||$s['previousTime']>$s['cutoffTime'])throw new RuntimeException('checkpoint_invalid');
    $total=$s['rangeTotal']??null;
    if(($total!==null&&(!is_int($total)||$total<0||$total>1000))||($s['page']>0&&$total===null))throw new RuntimeException('checkpoint_range_unverified');
    $n=count($s['accepted']);if($n>100000||$s['examined']!==$n)throw new RuntimeException('checkpoint_invalid');
    $minimum=$s['cutoffId']+1;
    foreach($s['accepted'] as $id=>$value){if(!is_int($id)||$id<$s['floor']||$id>$s['cutoffId']||$value!==true)throw new RuntimeException('checkpoint_invalid');$minimum=min($minimum,$id);}
    if($s['previousId']!==$minimum||($s['status']==='COMPLETE')!==($n===100000)||($s['status']==='INCOMPLETE')!==($s['upper']<$s['floor']))throw new RuntimeException('checkpoint_invalid');
    if(isset($s['failures'])&&(!is_int($s['failures'])||$s['failures']<0||$s['failures']>3))throw new RuntimeException('checkpoint_invalid');
    if($s['status']==='PAUSED_BY_OPERATOR'&&!in_array($s['pauseFrom']??null,['PAUSED','WAITING'],true))throw new RuntimeException('checkpoint_pause_unverified');
}
function labLoadCheckpoint(string $path):?array {
    if(!is_file($path))return null;
    if(filesize($path)>5000000)throw new RuntimeException('checkpoint_invalid');
    $state=json_decode((string)file_get_contents($path),true,32,JSON_THROW_ON_ERROR);
    if(!is_array($state))throw new RuntimeException('checkpoint_invalid');
    labAssertCheckpoint($state);return $state;
}
function labBackfillControl(array $state,string $command):array {
    labAssertCheckpoint($state);
    if($command==='pause'){
        if($state['status']==='PAUSED_BY_OPERATOR')return $state;
        if(!in_array($state['status'],['PAUSED','WAITING'],true))throw new RuntimeException('terminal_or_review_state');
        $state['pauseFrom']=$state['status'];$state['status']='PAUSED_BY_OPERATOR';
    }elseif($command==='resume'){
        if($state['status']!=='PAUSED_BY_OPERATOR')throw new RuntimeException('not_operator_paused');
        $state['status']=$state['pauseFrom'];unset($state['pauseFrom']);
    }else throw new RuntimeException('invalid_control');
    return $state;
}
function labBackfillStep(array $state,callable $fetch,callable $store,int $now):array {
    labAssertCheckpoint($state);
    if(!in_array($state['status'],['PAUSED','WAITING'],true)||$now<$state['nextAt'])return $state;
    $low=max($state['floor'],$state['upper']-999);
    $json=$fetch($low,$state['upper'],$state['page']);
    if(!is_array($json)||($json['number']??null)!==$state['page']||!is_bool($json['last']??null)||!is_array($json['content']??null)||!array_is_list($json['content'])||count($json['content'])>2)throw new RuntimeException('invalid_page');
    $total=$json['totalElements']??null;$pages=$json['totalPages']??null;$count=count($json['content']);
    if(!is_int($total)||$total<0||$total>$state['upper']-$low+1||!is_int($pages)||$pages!==intdiv($total+1,2)||($json['size']??null)!==2||($json['numberOfElements']??null)!==$count||($json['first']??null)!==($state['page']===0))throw new RuntimeException('invalid_pagination');
    if($total===0 ? $state['page']!==0||$count!==0||$json['last']!==true : $state['page']>=$pages||$count!==min(2,$total-$state['page']*2)||$json['last']!==($state['page']+1===$pages))throw new RuntimeException('inconsistent_pagination');
    if(($state['rangeTotal']??null)!==null&&$state['rangeTotal']!==$total)throw new RuntimeException('source_range_changed');
    $state['rangeTotal']=$total;
    // Validate the WHOLE page before the first source write.
    $previousId=$state['previousId'];$previousTime=$state['previousTime'];
    foreach($json['content'] as $r){
        if(!is_array($r)||!is_int($r['draw_id']??null)||!is_int($r['draw_time_ms']??null)||$r['draw_id']<$low||$r['draw_id']>$state['upper']||$r['draw_time_ms']<1000000000000||$r['draw_time_ms']>$previousTime||$r['draw_id']>=$previousId)throw new RuntimeException('invalid_source_identity_or_order');
        $previousId=$r['draw_id'];$previousTime=$r['draw_time_ms'];
    }
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
        $state['upper']=$low-1;$state['page']=0;$state['rangeTotal']=null;
        $state['status']=$state['upper']<$state['floor']?'INCOMPLETE':'PAUSED';
    }else {$state['page']++;$state['status']='PAUSED';}
    return $state;
}
function labSaveCheckpoint(string $path,array $state):void {
    labAssertCheckpoint($state);
    $tmp=$path.'.tmp';$bytes=json_encode($state,JSON_THROW_ON_ERROR);
    if(strlen($bytes)>5000000||file_put_contents($tmp,$bytes,LOCK_EX)!==strlen($bytes)||!chmod($tmp,0600)||!rename($tmp,$path))throw new RuntimeException('checkpoint_failure');
}
