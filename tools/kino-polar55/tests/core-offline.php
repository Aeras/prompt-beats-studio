<?php
declare(strict_types=1);
require __DIR__.'/../private/lab-service.php';
function demand(bool $v,string $name):void {if(!$v)throw new RuntimeException($name);}
function fixtures(int $n):Generator {
    for($i=1;$i<=$n;$i++)yield ['id'=>$i,'time'=>1793491200000+intdiv($i+1,2)*300000,'numbers'=>labRandom(20,'fixture-'.$i)];
}
if(($argv[1]??'')==='compare') {
    $v=json_decode(stream_get_contents(STDIN),true,64,JSON_THROW_ON_ERROR);
    echo json_encode(labAggregate($v['draws'],$v['method'],$v['k'],$v['seed']),JSON_THROW_ON_ERROR);exit;
}
if(($argv[1]??'')==='generated') {
    $v=json_decode(stream_get_contents(STDIN),true,16,JSON_THROW_ON_ERROR);
    if(!in_array($v['n'],[1000,5000,20000,50000,100000],true))throw new RuntimeException('invalid_fixture_count');
    echo json_encode(labAggregate(fixtures($v['n']),$v['method'],$v['k'],$v['seed']),JSON_THROW_ON_ERROR);exit;
}
foreach(['P00','F00','P01'] as $method) {
    $small=labAggregate(fixtures(5000),$method,8,'kino-lab-v1-retrospective');
    demand($small['stats']['n']===5000,'full_count');
    demand($small['backtest']['n']===500,'target_cap');
    demand(array_sum($small['stats']['counts'])===100000,'counts');
    demand($small['backtest']['results'][0]['trainingCount']===30,'equal_time_exclusion');
}
$started=microtime(true);$before=memory_get_usage(true);
$big=labAggregate(fixtures(100000),'P01',8,'kino-lab-v1-retrospective');
demand($big['stats']['n']===100000,'100k_full_count');
demand(array_sum($big['stats']['counts'])===2000000,'100k_sum');
demand($big['backtest']['n']===500,'100k_target_cap');
demand(memory_get_peak_usage(true)-$before<32*1024*1024,'bounded_memory');
demand(strlen(json_encode($big))<300000,'bounded_output');
$nums=range(1,20);$canonical=['drawId'=>1,'drawTime'=>1793491200000,'list'=>$nums,'bonus'=>1,'secondChance'=>null];
$row=['draw_id'=>'1','draw_time_ms'=>'1793491200000','main_numbers_json'=>json_encode($nums),'bonus_number'=>'1','second_chance_json'=>null,'content_sha256'=>hash('sha256',json_encode($canonical))];
demand(labRow($row)['numbers']===$nums,'row_contract');
foreach(['bad_hash','duplicate','bad_bonus','bad_second'] as $test) {
    $r=$row;
    if($test==='bad_hash')$r['content_sha256']=str_repeat('0',64);
    if($test==='duplicate')$r['main_numbers_json']=json_encode(array_fill(0,20,1));
    if($test==='bad_bonus')$r['bonus_number']='80';
    if($test==='bad_second')$r['second_chance_json']='[1,22,23]';
    $rejected=false;try{labRow($r);}catch(Throwable){$rejected=true;}demand($rejected,$test);
}
foreach([0,-1,100001,5001,'1000','1 OR 1=1']as $n){$rejected=false;try{labRequest(['op'=>'analysis','n'=>$n,'method'=>'P01','k'=>8,'seed'=>'fixture']);}catch(Throwable){$rejected=true;}demand($rejected,'invalid_request');}
$audit=sys_get_temp_dir().'/kino-audit-'.bin2hex(random_bytes(8));mkdir($audit,0700);
for($i=0;$i<105;$i++)labReadAudit($audit,str_repeat('a',64),'analysis','ok');
$events=json_decode(file_get_contents($audit.'/read-audit.json'),true,16,JSON_THROW_ON_ERROR);
demand(count($events)===100,'bounded_audit');unlink($audit.'/read-audit.json');rmdir($audit);
echo json_encode(['status'=>'PASS','rows'=>100000,'targets'=>500,'seconds'=>microtime(true)-$started,'peakBytes'=>memory_get_peak_usage(true),'outputBytes'=>strlen(json_encode($big))],JSON_THROW_ON_ERROR)."\n";
