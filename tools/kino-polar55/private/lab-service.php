<?php
declare(strict_types=1);
require_once __DIR__.'/lab-core.php';

/** Caller holds the existing cross-process admission lock. Preserve subsecond spacing. */
function labReadAdmission($lock,float $now):bool {
    $raw=stream_get_contents($lock,65);if(!is_string($raw)||strlen($raw)>64)throw new RuntimeException('rate_state_invalid');
    $last=$raw===''?0:json_decode($raw,true,4,JSON_THROW_ON_ERROR);
    if((!is_int($last)&&!is_float($last))||!is_finite((float)$last)||$last<0)throw new RuntimeException('rate_state_invalid');
    if($now-$last<2)return false;
    $value=json_encode($now,JSON_THROW_ON_ERROR);
    if(!ftruncate($lock,0)||!rewind($lock)||fwrite($lock,$value)!==strlen($value)||!fflush($lock))throw new RuntimeException('rate_state_unavailable');
    return true;
}

/** Private bounded operational evidence; never store IP, credentials, raw SQL or results. */
function labReadAudit(string $directory,string $owner,string $operation,string $status):void {
    $path=$directory.'/read-audit.json';$old=[];
    if(is_file($path)){
        if(filesize($path)>65536)throw new RuntimeException('audit_capacity');
        $old=json_decode((string)file_get_contents($path),true,16,JSON_THROW_ON_ERROR);
        if(!is_array($old)||!array_is_list($old))throw new RuntimeException('audit_invalid');
    }
    $old[]=['at'=>gmdate('c'),'owner'=>$owner,'op'=>$operation,'status'=>$status];
    $data=json_encode(array_slice($old,-100),JSON_THROW_ON_ERROR);$tmp=$path.'.tmp';
    if(file_put_contents($tmp,$data,LOCK_EX)!==strlen($data)||!chmod($tmp,0600)||!rename($tmp,$path))throw new RuntimeException('audit_unavailable');
}

function labRequest(array $v): array {
    $keys=array_keys($v);sort($keys);
    if (($v['op']??null)==='status' && $keys===['op']) return $v;
    if ($keys!==['k','method','n','op','seed'] || $v['op']!=='analysis' || !in_array($v['n'],[1000,5000,20000,50000,100000],true) || !in_array($v['k'],[5,8,10],true) || !in_array($v['method'],['P00','F00','P01'],true) || !is_string($v['seed']) || !preg_match('/^[a-zA-Z0-9_-]{1,100}$/D',$v['seed'])) throw new RuntimeException('invalid_request');
    return $v;
}

function labReadDb(array $config): PDO {
    if (($config['enabled']??false)!==true || ($config['schema_verified']??false)!==true) throw new RuntimeException('disabled');
    $db=$config['database']??[];
    if (($db['host']??'')!=='localhost' || ($db['name']??'')!=='promptbe_kino_history' || !is_string($db['user']??null) || !is_string($db['password']??null) || $db['password']==='' || $db['user']==='promptbe_kino_app') throw new RuntimeException('invalid_read_config');
    $pdo=new PDO('mysql:host=localhost;dbname=promptbe_kino_history;charset=utf8mb4',$db['user'],$db['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false,PDO::ATTR_TIMEOUT=>3]);
    $pdo->exec("SET SESSION time_zone='+00:00'");
    $pdo->exec('SET SESSION max_statement_time=12');
    $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    labAssertReadPrivileges($pdo);
    labAssertSchema($pdo);
    return $pdo;
}
function labAssertReadPrivileges(PDO $pdo):void {
    $tables=['kino_draws'=>false,'kino_draw_revisions'=>false];
    // SHOW GRANTS is server-owned, but parse whole statements: never normalize
    // escapes in privileges, grantees, authentication details or unknown clauses.
    $account="(?:`(?:[^`\r\n]|``)+`|'(?:[^'\\\\\r\n]|''|\\\\.)*')";
    $grantee=$account.'@'.$account;
    $identifier='(?:`[^`\r\n]+`|[a-zA-Z0-9_]+)';
    $usage='~\AGRANT USAGE ON \*\.\* TO '.$grantee."(?: IDENTIFIED BY PASSWORD '(?:\\*[a-fA-F0-9]{40})?')?\\z~i";
    $select='~\AGRANT SELECT ON ('.$identifier.')\.(\*|'.$identifier.') TO '.$grantee.'\z~i';
    foreach($pdo->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN) as $grant){
        if(!is_string($grant)||strlen($grant)>4096||preg_match('/[\x00-\x1f\x7f]/',$grant))throw new RuntimeException('read_only_account_required');
        if(preg_match($usage,$grant))continue;
        if(!preg_match($select,$grant,$m))throw new RuntimeException('read_only_account_required');
        $database=trim($m[1],'`');$table=trim($m[2],'`');
        // Only the known database's escaped underscores are decoded. Database
        // grants use LIKE patterns; require every underscore escaped for db.*.
        // Table-level scopes use literal names and retain existing compatibility.
        if(str_replace('\\_','_',$database)!=='promptbe_kino_history'||($table==='*'&&$database!=='promptbe\\_kino\\_history'))throw new RuntimeException('read_only_account_required');
        if($table==='*')$tables=array_fill_keys(array_keys($tables),true);
        elseif(array_key_exists($table,$tables))$tables[$table]=true;
        else throw new RuntimeException('read_only_account_required');
    }
    if(in_array(false,$tables,true))throw new RuntimeException('read_permissions_incomplete');
}
function labAssertSchema(PDO $pdo):void {
    // A nontransactional source could silently break the consistent snapshot guarantee.
    $engines=$pdo->query("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('kino_draws','kino_draw_revisions')")->fetchAll(PDO::FETCH_KEY_PAIR);
    if (count($engines)!==2 || count(array_filter($engines,static fn($e)=>$e==='InnoDB'))!==2) throw new RuntimeException('incompatible_schema');
    $key=$pdo->query("SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='kino_draws' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX")->fetchAll(PDO::FETCH_COLUMN);
    if($key!==['draw_id'])throw new RuntimeException('unique_draw_identity_required');
    $columns=$pdo->query("SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='kino_draws'")->fetchAll(PDO::FETCH_KEY_PAIR);
    if(!in_array($columns['draw_id']??'', ['int','bigint'],true)||($columns['draw_time_ms']??'')!=='bigint'||!in_array($columns['last_checked_at_utc']??'', ['datetime','timestamp'],true))throw new RuntimeException('numeric_identity_and_time_required');
    foreach(['main_numbers_json','second_chance_json','content_sha256','bonus_number']as $column)if(!isset($columns[$column]))throw new RuntimeException('required_column_missing');
}

/** Entire window is frozen inside ONE read-only consistent transaction, not across HTTP pages. */
function labReadAnalysis(PDO $db, array $request, string $tempDir): array {
    $started=microtime(true);
    $check=static function()use($started):void{if(microtime(true)-$started>18)throw new RuntimeException('analysis_timeout');};
    if(!is_dir($tempDir)||!is_writable($tempDir)||disk_free_space($tempDir)<48*1024*1024)throw new RuntimeException('private_storage_unavailable');
    $path=tempnam($tempDir,'lab-');if($path===false)throw new RuntimeException('private_storage_unavailable');
    if(!chmod($path,0600)){unlink($path);throw new RuntimeException('private_storage_unavailable');}
    register_shutdown_function(static function()use($path){if(is_file($path))unlink($path);});
    $file=fopen($path,'w+b');if(!$file){unlink($path);throw new RuntimeException('private_storage_unavailable');}
    try {
        $db->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        $summary=$db->query('SELECT COUNT(*) AS stored, MAX(draw_id) AS cutoff, MAX(last_checked_at_utc) AS observed FROM kino_draws')->fetch(PDO::FETCH_ASSOC);
        if($request['op']==='status') {$db->rollBack();return ['version'=>1,'source'=>'polar55','stored'=>(int)$summary['stored'],'lastObserved'=>$summary['observed'],'coverage'=>'COMPLETENESS_UNVERIFIED','backfill'=>'DISABLED'];}
        $cutoff=(int)($summary['cutoff']??0);
        $db->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,false);
        $sql='SELECT d.draw_id,d.draw_time_ms,SUBSTRING(d.main_numbers_json,1,2049) AS main_numbers_json,d.bonus_number,SUBSTRING(d.second_chance_json,1,2049) AS second_chance_json,d.content_sha256 FROM kino_draws d WHERE d.draw_id<=? AND NOT EXISTS (SELECT 1 FROM kino_draw_revisions r WHERE r.draw_id=d.draw_id AND r.review_status=?) ORDER BY d.draw_time_ms DESC,d.draw_id DESC LIMIT 200001';
        $statement=$db->prepare($sql);$statement->execute([$cutoff,'pending']);
        $offsets=[];$rejected=0;$scanned=0;$hash=hash_init('sha256');
        while($raw=$statement->fetch(PDO::FETCH_ASSOC)) {
            $check();if(++$scanned>200000)throw new RuntimeException('scan_limit');
            try {$draw=labRow($raw);}catch(JsonException|RuntimeException){$rejected++;continue;}
            $line=json_encode($draw,JSON_THROW_ON_ERROR)."\n";
            $offsets[]=ftell($file);if(fwrite($file,$line)!==strlen($line))throw new RuntimeException('snapshot_write_failed');
            hash_update($hash,$line);
            if(count($offsets)>=$request['n'])break;
        }
        $statement->closeCursor();$db->rollBack();
        $rows=(static function()use($file,$offsets,$check):Generator {
            for($i=count($offsets)-1;$i>=0;$i--){$check();if(fseek($file,$offsets[$i])!==0)throw new RuntimeException('snapshot_read_failed');$line=fgets($file,2048);if($line===false)throw new RuntimeException('snapshot_read_failed');yield json_decode($line,true,32,JSON_THROW_ON_ERROR);}
        })();
        $result=labAggregate($rows,$request['method'],$request['k'],$request['seed']);
        return ['version'=>1,'source'=>'polar55','requested'=>$request['n'],'loaded'=>count($offsets),'stored'=>(int)$summary['stored'],'cutoff'=>$cutoff,'lastObserved'=>$summary['observed'],'snapshotAt'=>gmdate('c'),'sha256'=>hash_final($hash),'rejected'=>$rejected,'coverage'=>'COMPLETENESS_UNVERIFIED','partial'=>count($offsets)<$request['n'],'backfill'=>'DISABLED','options'=>$request,'result'=>$result];
    } finally {
        if($db->inTransaction())$db->rollBack();
        fclose($file);unlink($path);
    }
}
