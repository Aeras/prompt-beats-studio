<?php
declare(strict_types=1);
function kinoErrorCode(Throwable $e): string { return $e instanceof PDOException ? 'database' : ($e instanceof JsonException ? 'json' : 'source_or_validation'); }
function kinoFetch(string $url): string {
    if ($url !== 'https://api.opap.gr/draws/v3.0/1100/last-result-and-active') throw new RuntimeException('URL not allowed');
    if (!function_exists('curl_init')) throw new RuntimeException('PHP curl unavailable');
    $ch = curl_init($url);
    if (!$ch) throw new RuntimeException('curl init');
    $bytes='';
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>false,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>12,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_USERAGENT=>'KinoSyncPilot/1.0',CURLOPT_HTTPHEADER=>['Accept: application/json'],CURLOPT_WRITEFUNCTION=>static function ($ch,$chunk) use (&$bytes) { if (strlen($bytes)+strlen($chunk)>131072) return 0; $bytes.=$chunk; return strlen($chunk); }]);
    $ok=curl_exec($ch); $status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); $ct=(string)curl_getinfo($ch,CURLINFO_CONTENT_TYPE); curl_close($ch);
    if ($ok === false || $status !== 200 || !preg_match('~^application/json\b~i',$ct)) throw new RuntimeException('Upstream unavailable');
    return $bytes;
}
function kinoNormalize(array $r,string $endpoint): array {
    if (($r['gameId']??null)!==1100 || ($r['status']??null)!=='results') throw new RuntimeException('Not completed game 1100');
    $id=$r['drawId']??null; $ms=$r['drawTime']??null;
    if (!is_int($id) || $id<=0 || !is_int($ms) || $ms<1000000000000 || $ms>4102444800000) throw new RuntimeException('Invalid draw id/time');
    $win=$r['winningNumbers']??null; if (!is_array($win)) throw new RuntimeException('Missing winnings');
    $nums=$win['list']??null;
    if (!is_array($nums) || count($nums)!==20 || array_keys($nums)!==range(0,19)) throw new RuntimeException('Expected 20 numbers');
    foreach($nums as $v) if (!is_int($v)||$v<1||$v>80) throw new RuntimeException('Invalid number');
    if(count(array_unique($nums))!==20) throw new RuntimeException('Duplicate numbers');
    $bonus=$win['bonus']??null;
    if ($bonus!==null) {
        if (!is_array($bonus)||count($bonus)!==1||!is_int($bonus[0])||!in_array($bonus[0],$nums,true)) throw new RuntimeException('Invalid bonus');
        $bonus=$bonus[0];
    }
    $second=$win['secondChance']??null;
    if ($second!==null) {
        if(!is_array($second)||count($second)!==3||array_keys($second)!==range(0,2)||count(array_unique($second))!==3) throw new RuntimeException('Invalid second chance');
        foreach($second as $v) if(!is_int($v)||$v<1||$v>80||in_array($v,$nums,true)) throw new RuntimeException('Second chance overlap');
    }
    $seconds=intdiv($ms,1000); $millis=$ms%1000;
    $utc=(new DateTimeImmutable('@'.$seconds))->setTimezone(new DateTimeZone('UTC'));
    $gr=$utc->setTimezone(new DateTimeZone('Europe/Athens'));
    $canonical=json_encode(['drawId'=>$id,'drawTime'=>$ms,'list'=>$nums,'bonus'=>$bonus,'secondChance'=>$second],JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    return ['draw_id'=>$id,'draw_time_ms'=>$ms,'draw_time_utc'=>$utc->format('Y-m-d H:i:s').sprintf('.%03d',$millis),'draw_date_gr'=>$gr->format('Y-m-d'),'draw_clock_gr'=>$gr->format('H:i:s'),'gr_utc_offset_minutes'=>intdiv($gr->getOffset(),60),'main_numbers_json'=>json_encode($nums,JSON_THROW_ON_ERROR),'bonus_number'=>$bonus,'second_chance_json'=>$second===null?null:json_encode($second,JSON_THROW_ON_ERROR),'content_sha256'=>hash('sha256',$canonical),'source_endpoint'=>$endpoint];
}
function kinoStore(PDO $pdo,array $r): string {
    $pdo->beginTransaction();
    try {
        $existing=$pdo->prepare('SELECT content_sha256,main_numbers_json,bonus_number,second_chance_json FROM kino_draws WHERE draw_id = ? FOR UPDATE');
        $existing->execute([$r['draw_id']]); $old=$existing->fetch(PDO::FETCH_ASSOC);
        $now=(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
        if ($old) {
            if (hash_equals($old['content_sha256'],$r['content_sha256'])) {
                $st=$pdo->prepare('UPDATE kino_draws SET last_checked_at_utc=? WHERE draw_id=?');$st->execute([$now,$r['draw_id']]); $pdo->commit();return 'unchanged';
            }
            // Keep current record unchanged until manual review. Never silently overwrite.
            $check=$pdo->prepare('SELECT COUNT(*) FROM kino_draw_revisions WHERE draw_id=? AND new_content_sha256=? AND review_status=?');
            $check->execute([$r['draw_id'],$r['content_sha256'],'pending']);
            if ((int)$check->fetchColumn()===0) {
                $rev=$pdo->prepare('INSERT INTO kino_draw_revisions (draw_id,observed_at_utc,old_content_sha256,new_content_sha256,old_main_numbers_json,new_main_numbers_json,old_bonus_number,new_bonus_number,old_second_chance_json,new_second_chance_json,source_endpoint,review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
                $rev->execute([$r['draw_id'],$now,$old['content_sha256'],$r['content_sha256'],$old['main_numbers_json'],$r['main_numbers_json'],$old['bonus_number'],$r['bonus_number'],$old['second_chance_json'],$r['second_chance_json'],$r['source_endpoint'],'pending']);
            }
            $pdo->commit(); return 'revision_pending';
        }
        $cols=array_keys($r);
        $sql='INSERT INTO kino_draws ('.implode(',',$cols).',schema_version,first_observed_at_utc,last_checked_at_utc,current_version_observed_at_utc,created_at_utc,updated_at_utc) VALUES ('.implode(',',array_fill(0,count($cols),'?')).',1,?,?,?,?,?)';
        $insert=$pdo->prepare($sql); $insert->execute(array_merge(array_values($r),[$now,$now,$now,$now,$now]));
        $pdo->commit(); return 'inserted';
    } catch (Throwable $e) { if($pdo->inTransaction())$pdo->rollBack();throw $e; }
}
