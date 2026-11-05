<?php
/** Synthetic schema only; NOT a production migration or production schema certification. */
declare(strict_types=1);
require __DIR__.'/../private/lab-service.php';
function check(bool $ok,string $reason):void{if(!$ok)throw new RuntimeException($reason);}
if(getenv('KINO_DISPOSABLE_FIXTURE')!=='1')throw new RuntimeException('fixture_required');
$root=new PDO('mysql:host=127.0.0.1;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$root->exec('CREATE DATABASE promptbe_kino_history');
$root->exec('USE promptbe_kino_history');
$root->exec('CREATE TABLE kino_draws (draw_id BIGINT PRIMARY KEY, draw_time_ms BIGINT NOT NULL, main_numbers_json TEXT NOT NULL, bonus_number INT NULL, second_chance_json TEXT NULL, content_sha256 CHAR(64) NOT NULL, last_checked_at_utc DATETIME(3), INDEX by_time(draw_time_ms,draw_id)) ENGINE=InnoDB');
$root->exec('CREATE TABLE kino_draw_revisions (draw_id BIGINT, review_status VARCHAR(20), INDEX by_draw(draw_id,review_status)) ENGINE=InnoDB');
$root->exec('ALTER TABLE kino_draws ADD draw_time_utc DATETIME(3), ADD draw_date_gr DATE, ADD draw_clock_gr TIME, ADD gr_utc_offset_minutes INT, ADD source_endpoint VARCHAR(250), ADD schema_version INT, ADD first_observed_at_utc DATETIME(3), ADD current_version_observed_at_utc DATETIME(3), ADD created_at_utc DATETIME(3), ADD updated_at_utc DATETIME(3)');
$root->exec('ALTER TABLE kino_draw_revisions ADD observed_at_utc DATETIME(3), ADD old_content_sha256 CHAR(64), ADD new_content_sha256 CHAR(64), ADD old_main_numbers_json TEXT, ADD new_main_numbers_json TEXT, ADD old_bonus_number INT, ADD new_bonus_number INT, ADD old_second_chance_json TEXT, ADD new_second_chance_json TEXT, ADD source_endpoint VARCHAR(250)');
$root->exec("CREATE USER 'lab_read'@'%' IDENTIFIED BY 'SYNTHETIC_FIXTURE_ONLY'");
$root->exec("GRANT SELECT ON promptbe_kino_history.kino_draws TO 'lab_read'@'%'");
$root->exec("GRANT SELECT ON promptbe_kino_history.kino_draw_revisions TO 'lab_read'@'%'");
$insert=$root->prepare('INSERT INTO kino_draws (draw_id,draw_time_ms,main_numbers_json,bonus_number,second_chance_json,content_sha256,last_checked_at_utc) VALUES (?,?,?,?,?,?,?)');
$root->beginTransaction();
$frozenCounts=array_fill(0,80,0);
for($id=1;$id<=100003;$id++) {
    $numbers=labRandom(20,'fixture-'.$id);$time=1793491200000+intdiv($id+1,2)*300000;
    $canonical=['drawId'=>$id,'drawTime'=>$time,'list'=>$numbers,'bonus'=>null,'secondChance'=>null];
    if($id>=2&&!in_array($id,[100001,100002],true))foreach($numbers as $number)$frozenCounts[$number-1]++;
    $insert->execute([$id,$time,json_encode($numbers),null,null,hash('sha256',json_encode($canonical)),'2026-11-04 12:00:00.000']);
    if($id===77){
        $root->commit();
        $partialRead=new PDO('mysql:host=127.0.0.1;dbname=promptbe_kino_history;charset=utf8mb4','lab_read','SYNTHETIC_FIXTURE_ONLY',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
        $partialRead->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        labAssertReadPrivileges($partialRead);
        $partial=labReadAnalysis($partialRead,['op'=>'analysis','n'=>100000,'method'=>'F00','k'=>12,'seed'=>'partial-fixture'],sys_get_temp_dir());
        check($partial['requested']===100000&&$partial['stored']===77&&$partial['loaded']===77&&$partial['partial']===true,'honest_partial_without_window_rewrite');
        check(count($partial['result']['proposal'])===12&&array_sum($partial['result']['stats']['counts'])===77*20,'partial_12_number_analysis');
        $partialRead=null;$root->beginTransaction();
    }
}
$root->commit();
$root->exec("UPDATE kino_draws SET content_sha256=REPEAT('0',64) WHERE draw_id=100002");
$root->exec("INSERT INTO kino_draw_revisions (draw_id,review_status) VALUES (100001,'pending')");
// A second connection inserts after the consistent transaction's first summary query.
class SnapshotPDO extends PDO {
    public ?Closure $afterSummary=null;
    public function query(string $query,?int $fetchMode=null,mixed ...$fetchModeArgs):PDOStatement|false {
        $result=$fetchMode===null?parent::query($query):parent::query($query,$fetchMode,...$fetchModeArgs);
        if(str_contains($query,'COUNT(*) AS stored')&&$this->afterSummary){($this->afterSummary)();$this->afterSummary=null;}
        return $result;
    }
}
$read=new SnapshotPDO('mysql:host=127.0.0.1;dbname=promptbe_kino_history;charset=utf8mb4','lab_read','SYNTHETIC_FIXTURE_ONLY',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
$read->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
labAssertSchema($read);
labAssertReadPrivileges($read);
$denied=false;try{labAssertReadPrivileges($root);}catch(RuntimeException){$denied=true;}check($denied,'overprivileged_account_rejected');
$denied=false;try{$read->exec('DELETE FROM kino_draws WHERE draw_id=1');}catch(PDOException){$denied=true;}check($denied,'read_only_grants');
$read->afterSummary=static function()use($root):void{
    $root->exec('INSERT INTO kino_draws (draw_id,draw_time_ms,main_numbers_json,bonus_number,second_chance_json,content_sha256,last_checked_at_utc) SELECT 100004,draw_time_ms+300000,main_numbers_json,NULL,NULL,content_sha256,last_checked_at_utc FROM kino_draws WHERE draw_id=100003');
    $time=1793491200000+intdiv(100004,2)*300000;
    $content=['drawId'=>100003,'drawTime'=>$time,'list'=>range(1,20),'bonus'=>null,'secondChance'=>null];
    $update=$root->prepare('UPDATE kino_draws SET main_numbers_json=?,content_sha256=? WHERE draw_id=100003');
    $update->execute([json_encode(range(1,20)),hash('sha256',json_encode($content))]);
};
$started=microtime(true);
$result=labReadAnalysis($read,['op'=>'analysis','n'=>100000,'method'=>'P01','k'=>8,'seed'=>'kino-lab-v1-retrospective'],sys_get_temp_dir());
check($result['loaded']===100000,'full_valid_window');check($result['cutoff']===100003,'frozen_cutoff');
check($result['rejected']===1,'hash_quarantine');check($result['result']['first']['id']===2,'valid_latest_count');
check($result['result']['last']['id']===100003,'new_draw_excluded');check($result['result']['backtest']['n']===500,'target_cap');
check($result['result']['stats']['counts']===$frozenCounts,'concurrent_valid_revision_cannot_change_snapshot');
check((int)$root->query('SELECT COUNT(*) FROM kino_draws')->fetchColumn()===100004,'no_source_delete');
check(glob(sys_get_temp_dir().'/lab-*')===[],'temporary_snapshots_removed');
echo json_encode(['status'=>'PASS','loaded'=>$result['loaded'],'seconds'=>microtime(true)-$started,'peakBytes'=>memory_get_peak_usage(true),'outputBytes'=>strlen(json_encode($result))],JSON_THROW_ON_ERROR)."\n";

// Verify SQL reads use the exact selected window, without old 100/1000 caps.
foreach([5,10,20,50,100,200,500,1000,5000,20000,50000,100000]as $window){
    $selected=labReadAnalysis($read,['op'=>'analysis','n'=>$window,'method'=>'F00','k'=>12,'seed'=>'window-fixture'],sys_get_temp_dir());
    check($selected['requested']===$window&&$selected['loaded']===$window&&!$selected['partial'],'database_window_'.$window);
    check(array_sum($selected['result']['stats']['counts'])===$window*20,'database_full_counts_'.$window);
    check(strlen(json_encode($selected))<300000,'bounded_response_'.$window);
}
echo "ALL_12_SQL_WINDOWS_AND_HONEST_PARTIAL_PASS\n";

// The actual archived store, not a mock SQL writer; still only this synthetic DB.
require __DIR__.'/legacy/kino-sync-lib.php';
$raw=['gameId'=>1100,'drawId'=>200001,'drawTime'=>1793491200000,'status'=>'results','winningNumbers'=>['list'=>range(1,20),'bonus'=>[1]]];
$normal=kinoNormalize($raw,'https://api.opap.gr/draws/v3.0/1100/200001');
check(kinoStore($root,$normal)==='inserted','legacy_insert');check(kinoStore($root,$normal)==='unchanged','legacy_idempotency');
$raw['winningNumbers']['list']=range(21,40);$raw['winningNumbers']['bonus']=[21];
$changed=kinoNormalize($raw,'https://api.opap.gr/draws/v3.0/1100/200001');
check(kinoStore($root,$changed)==='revision_pending','legacy_conflict');check(kinoStore($root,$changed)==='revision_pending','legacy_conflict_replay');
check($root->query('SELECT content_sha256 FROM kino_draws WHERE draw_id=200001')->fetchColumn()===$normal['content_sha256'],'no_silent_overwrite');
check((int)$root->query('SELECT COUNT(*) FROM kino_draw_revisions WHERE draw_id=200001')->fetchColumn()===1,'revision_deduplication');
echo "LEGACY_STORE_IDEMPOTENCY_CONFLICT_PASS\n";
$native=labReadDb(['enabled'=>true,'schema_verified'=>true,'database'=>['host'=>'localhost','name'=>'promptbe_kino_history','user'=>'lab_read','password'=>'SYNTHETIC_FIXTURE_ONLY']]);
$nativeResult=labReadAnalysis($native,['op'=>'analysis','n'=>1000,'method'=>'F00','k'=>5,'seed'=>'native-config-fixture'],sys_get_temp_dir());
check($nativeResult['loaded']===1000&&count($nativeResult['result']['proposal'])===5,'real_read_config_and_unix_socket');
echo "ACTUAL_READ_CONFIG_SOCKET_PRIVILEGE_AND_ANALYSIS_PASS\n";
// Reproduce Polar55's MariaDB database-level escaped-underscore grant.
// Entirely synthetic: no production user, grants, database or credentials.
$root->exec("CREATE USER 'lab_db_read'@'%' IDENTIFIED BY 'SYNTHETIC_FIXTURE_ONLY'");
$root->exec("GRANT SELECT ON `promptbe\_kino\_history`.* TO 'lab_db_read'@'%'");
$dbRead=labReadDb(['enabled'=>true,'schema_verified'=>true,'database'=>['host'=>'localhost','name'=>'promptbe_kino_history','user'=>'lab_db_read','password'=>'SYNTHETIC_FIXTURE_ONLY']]);
$hasEscaped=false;foreach($dbRead->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN)as $grant)if(str_contains($grant,'`promptbe\_kino\_history`.*'))$hasEscaped=true;
check($hasEscaped,'actual_mariadb_escaped_grant_fixture');
$dbStatus=labReadAnalysis($dbRead,['op'=>'status'],sys_get_temp_dir());
check($dbStatus['stored']===100005,'escaped_database_grant_read_connection');
foreach(['INSERT INTO kino_draw_revisions (draw_id) VALUES (999999)','UPDATE kino_draws SET draw_id=draw_id WHERE draw_id=1','DELETE FROM kino_draws WHERE draw_id=1']as $write){
    $denied=false;try{$dbRead->exec($write);}catch(PDOException){$denied=true;}check($denied,'escaped_database_reader_cannot_write');
}
$root->exec("GRANT UPDATE ON `promptbe\_kino\_history`.* TO 'lab_db_read'@'%'");
$denied=false;try{labAssertReadPrivileges($dbRead);}catch(RuntimeException){$denied=true;}check($denied,'escaped_database_with_write_rejected');
echo "MARIADB_ESCAPED_DATABASE_READ_ONLY_GRANTS_PASS\n";
$root->exec('ALTER TABLE kino_draws MODIFY draw_id VARCHAR(20) NOT NULL');
$denied=false;try{labAssertSchema($read);}catch(RuntimeException){$denied=true;}check($denied,'lexical_draw_identity_rejected');
$root->exec('ALTER TABLE kino_draws MODIFY draw_id BIGINT NOT NULL');
$root->exec('ALTER TABLE kino_draws DROP PRIMARY KEY');
$denied=false;try{labAssertSchema($read);}catch(RuntimeException){$denied=true;}check($denied,'missing_unique_identity_rejected');
echo "SCHEMA_IDENTITY_FAIL_CLOSED_PASS\n";
