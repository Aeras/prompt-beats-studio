<?php
/** KINO history engine. CLI-only, private directory. */
declare(strict_types=1);
require_once __DIR__.'/kino-sync-lib.php';
const KINO_BASE='https://api.opap.gr/draws/v3.0/1100/';
function kinoCliOnly(): void {if(PHP_SAPI!=='cli'){http_response_code(404);exit;}}
function kinoDb(): PDO {
    $config=require __DIR__.'/config.php';
    if(!is_array($config))throw new RuntimeException('Invalid config');
    $db=$config['database']??null;
    if(!is_array($db)||($db['host']??'')!=='localhost'||($db['name']??'')!=='promptbe_kino_history'||($db['user']??'')!=='promptbe_kino_app'||!is_string($db['password']??null)||$db['password']==='')throw new RuntimeException('Unexpected database config');
    $pdo=new PDO('mysql:host=localhost;dbname=promptbe_kino_history;charset=utf8mb4',$db['user'],$db['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false,PDO::ATTR_TIMEOUT=>5]);
    $pdo->exec("SET SESSION time_zone = '+00:00'");
    return $pdo;
}
function kinoGet(string $url): array {
    if(!str_starts_with($url,KINO_BASE))throw new RuntimeException('Disallowed source');
    $path=substr($url,strlen(KINO_BASE));
    if(!($path==='last-result-and-active'||preg_match('~^[1-9][0-9]{0,11}$~D',$path)||preg_match('~^draw-date/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}\?limit=2&page=[0-9]{1,6}$~D',$path)))throw new RuntimeException('Invalid source path');
    if(!function_exists('curl_init'))throw new RuntimeException('PHP curl missing');
    $ch=curl_init($url); if(!$ch)throw new RuntimeException('Curl initialization failed');
    $body='';
    curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_RETURNTRANSFER=>false,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>14,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_USERAGENT=>'KinoPolarHistory/1.0 (bounded sync)',CURLOPT_HTTPHEADER=>['Accept: application/json'],CURLOPT_WRITEFUNCTION=>static function($ch,$chunk)use(&$body){if(strlen($body)+strlen($chunk)>131072)return 0;$body.=$chunk;return strlen($chunk);}]);
    $ok=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$ct=(string)curl_getinfo($ch,CURLINFO_CONTENT_TYPE);curl_close($ch);
    if($ok===false||$code!==200||!preg_match('~^application/json\b~i',$ct))throw new RuntimeException('Source HTTP/format error (status '. $code .')');
    $data=json_decode($body,true,32,JSON_THROW_ON_ERROR);if(!is_array($data))throw new RuntimeException('Invalid source JSON');
    return $data;
}
function kinoLocked(callable $work): void {
    $lock=fopen(__DIR__.'/.kino-worker.lock','c');if(!$lock)throw new RuntimeException('Cannot obtain worker lock');
    if(!flock($lock,LOCK_EX|LOCK_NB)){fclose($lock);echo "BUSY (another job running)\n";return;}
    try{$work();}finally{flock($lock,LOCK_UN);fclose($lock);}
}
function kinoIncr(PDO $db,bool $commit,int $limit=8): void {
    if($limit<1||$limit>10)throw new RuntimeException('Incremental batch must be 1..10');
    $anchor=kinoGet(KINO_BASE.'last-result-and-active');
    if(!is_array($anchor['last']??null))throw new RuntimeException('No completed anchor');
    $end=kinoNormalize($anchor['last'],KINO_BASE.'last-result-and-active')['draw_id'];
    $max=$db->query('SELECT MAX(draw_id) FROM kino_draws')->fetchColumn();
    if($max===false||$max===null)throw new RuntimeException('Initial draw absent; run explicit pilot first');
    $start=(int)$max+1;
    if($start>$end){echo "UP_TO_DATE latest=$end\n";return;}
    if($end-$start>50000)throw new RuntimeException('Large gap: use supervised recovery');
    $stop=min($end,$start+$limit-1);echo 'INCREMENTAL '.($commit?'COMMIT':'DRY_RUN')." from=$start through=$stop anchor=$end\n";
    for($id=$start;$id<=$stop;$id++){
        $url=KINO_BASE.$id;$record=kinoGet($url);$norm=kinoNormalize($record,$url);
        if($norm['draw_id']!==$id)throw new RuntimeException('Unexpected draw ID');
        if(!$commit){echo "VALIDATED $id\n";continue;}
        $action=kinoStore($db,$norm);echo "DRAW $id $action\n";
        if($action==='revision_pending')throw new RuntimeException('Manual review required');
        usleep(250000);
    }
    echo "INCREMENTAL_OK\n";
}
function kinoBackfill(PDO $db,bool $commit,string $from,string $through,int $pages): void {
    if($pages<1||$pages>10)throw new RuntimeException('Pages must be 1..10');
    foreach([$from,$through]as $d){$parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$d,new DateTimeZone('UTC'));if(!$parsed||$parsed->format('Y-m-d')!==$d)throw new RuntimeException('Invalid UTC date');}
    if($from>$through)throw new RuntimeException('from after through');
    $lastDate=(new DateTimeImmutable($through,new DateTimeZone('UTC')))->modify('+1 day');
    if((new DateTimeImmutable($from,new DateTimeZone('UTC')))->diff($lastDate)->days>366)throw new RuntimeException('Date range limited to 365 days');
    $statePath=__DIR__.'/.kino-backfill-state.json';
    $cursor=['from'=>$from,'through'=>$through,'date'=>$from,'page'=>0];
    if($commit&&file_exists($statePath)){
        $saved=json_decode((string)file_get_contents($statePath),true);
        if(!is_array($saved)||($saved['from']??null)!==$from||($saved['through']??null)!==$through)throw new RuntimeException('Existing backfill checkpoint for different interval');
        $cursor=$saved;
    }
    $date=$cursor['date'];$page=(int)$cursor['page'];
    echo 'BACKFILL '.($commit?'COMMIT':'DRY_RUN')." UTC=$from..$through start=$date page=$page maxPages=$pages\n";
    $processed=0;
    while($processed<$pages&&$date<=$through){
        $path='draw-date/'.$date.'/'.$date.'?limit=2&page='.$page;
        $json=kinoGet(KINO_BASE.$path);
        if(!isset($json['content'])||!is_array($json['content'])||!array_is_list($json['content'])||!isset($json['number'])||!is_int($json['number'])||$json['number']!==$page)throw new RuntimeException('Unexpected paginated response');
        if(isset($json['totalPages'])&&(!is_int($json['totalPages'])||$json['totalPages']>1000000))throw new RuntimeException('Invalid pagination');
        $entries=$json['content'];if(count($entries)>2)throw new RuntimeException('Page exceeds requested limit');
        $items=[];
        foreach($entries as $row){if(!is_array($row))throw new RuntimeException('Non-object draw');$norm=kinoNormalize($row,KINO_BASE.$path);if(gmdate('Y-m-d',intdiv($norm['draw_time_ms'],1000))!==$date)throw new RuntimeException('Wrong UTC date');$items[]=$norm;}
        // The official endpoint is descending; store oldest first inside each page.
        $items=array_reverse($items);
        foreach($items as $norm){if($commit){$action=kinoStore($db,$norm);if($action==='revision_pending')throw new RuntimeException('Revision requires review');echo 'DRAW '.$norm['draw_id'].' '.$action."\n";}else echo 'VALID '.$norm['draw_id']."\n";}
        $processed++;
        $last=($json['last']??false)===true || count($entries)===0 || (isset($json['totalPages'])&&$page+1>=$json['totalPages']);
        if($last){$date=(new DateTimeImmutable($date,new DateTimeZone('UTC')))->modify('+1 day')->format('Y-m-d');$page=0;}else{$page++;}
        if($commit){$next=['from'=>$from,'through'=>$through,'date'=>$date,'page'=>$page];$tmp=$statePath.'.tmp';if(file_put_contents($tmp,json_encode($next,JSON_THROW_ON_ERROR),LOCK_EX)===false||!rename($tmp,$statePath))throw new RuntimeException('Checkpoint write failed');}
        usleep(350000);
    }
    if($commit&&$date>$through){@unlink($statePath);echo "BACKFILL_FINISHED\n";}else echo 'BACKFILL_'.($commit?'PAUSED':'PREVIEW_OK')." next=$date page=$page\n";
}
