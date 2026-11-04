<?php
declare(strict_types=1);
require __DIR__.'/../private/lab-service.php';
// Exercise the real PDO entry point without a network/database dependency.
class FixtureGrantStatement extends PDOStatement {
    public function __construct(private array $rows) {}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return $this->rows;}
}
class FixtureGrantPDO extends PDO {
    public function __construct(private array $rows) {}
    public function query(string $query,?int $fetchMode=null,mixed ...$args):PDOStatement|false {
        if($query!=='SHOW GRANTS')throw new RuntimeException('unexpected_query');
        return new FixtureGrantStatement($this->rows);
    }
}
$account="`fixture_reader`@`localhost`";
$usage="GRANT USAGE ON *.* TO $account IDENTIFIED BY PASSWORD '".'*'.str_repeat('A',40)."'";
$escaped='`promptbe\_kino\_history`';
$literal='`promptbe_kino_history`';
$select=static fn(string $scope):string=>"GRANT SELECT ON $scope TO $account";
$accepted=[
    'escaped_database'=>[$usage,$select($escaped.'.*')],
    'literal_tables'=>[$usage,$select($literal.'.`kino_draws`'),$select($literal.'.`kino_draw_revisions`')],
    'escaped_tables'=>[$usage,$select($escaped.'.`kino_draws`'),$select($escaped.'.`kino_draw_revisions`')],
    'unquoted_literal_tables'=>["GRANT USAGE ON *.* TO 'fixture_reader'@'%'",$select('promptbe_kino_history.kino_draws'),$select('promptbe_kino_history.kino_draw_revisions')],
    'no_auth_suffix'=>["GRANT USAGE ON *.* TO $account",$select($escaped.'.*')],
];
$rejected=[
    'global_select'=>[$usage,$select('*.*')],
    'write_privilege'=>[$usage,"GRANT SELECT, INSERT ON $escaped.* TO $account"],
    'additional_write_grant'=>[$usage,$select($escaped.'.*'),"GRANT UPDATE ON $escaped.* TO $account"],
    'all_privileges'=>[$usage,"GRANT ALL PRIVILEGES ON $escaped.* TO $account"],
    'grant_option'=>[$usage,$select($escaped.'.*').' WITH GRANT OPTION'],
    'usage_grant_option'=>[$usage.' WITH GRANT OPTION',$select($escaped.'.*')],
    'role'=>[$usage,$select($escaped.'.*'),"GRANT `writer_role` TO $account"],
    'proxy'=>[$usage,$select($escaped.'.*'),"GRANT PROXY ON `writer`@`localhost` TO $account"],
    'other_database'=>[$usage,$select('`other_history`.*')],
    'database_suffix'=>[$usage,$select('`promptbe\_kino\_history_extra`.*')],
    'unescaped_database_wildcards'=>[$usage,$select($literal.'.*')],
    'partially_escaped_database_wildcards'=>[$usage,$select('`promptbe\_kino_history`.*')],
    'percent_database'=>[$usage,$select('`promptbe\_kino\_history%`.*')],
    'unknown_escape'=>[$usage,$select('`promptbe\q_kino_history`.*')],
    'double_escape'=>[$usage,$select('`promptbe'.str_repeat('\\',2).'_kino'.str_repeat('\\',2).'_history`.*')],
    'unknown_table'=>[$usage,$select($literal.'.`kino_sync_runs`')],
    'table_suffix'=>[$usage,$select($literal.'.`kino_draws_extra`')],
    'column_grant'=>[$usage,"GRANT SELECT (draw_id) ON $literal.kino_draws TO $account"],
    'unbalanced_identifier'=>[$usage,$select('`promptbe\_kino\_history.*')],
    'empty_grantee'=>[$usage,"GRANT SELECT ON $escaped.* TO "],
    'trailing_sql'=>[$usage,$select($escaped.'.*').'; GRANT INSERT ON *.* TO '.$account],
    'trailing_clause'=>[$usage,$select($escaped.'.*').' WITH SOMETHING'],
    'newline'=>[$usage,$select($escaped.'.*')."\n"],
    'null_byte'=>[$usage,$select($escaped.'.*')."\0"],
    'malformed_usage'=>["GRANT USAGE ON *.* TO $account garbage",$select($escaped.'.*')],
    'empty'=>[],
    'usage_only'=>[$usage],
    'missing_table'=>[$usage,$select($literal.'.kino_draws')],
    'non_string'=>[$usage,123],
    'oversized'=>[$usage,str_repeat('x',4097)],
];
$failures=[];
foreach($accepted as $name=>$rows){try{labAssertReadPrivileges(new FixtureGrantPDO($rows));}catch(Throwable){$failures[]='valid_'.$name;}}
foreach($rejected as $name=>$rows){$denied=false;try{labAssertReadPrivileges(new FixtureGrantPDO($rows));}catch(RuntimeException $e){$denied=in_array($e->getMessage(),['read_only_account_required','read_permissions_incomplete'],true);}catch(Throwable){}if(!$denied)$failures[]='unsafe_'.$name;}
echo json_encode(['status'=>$failures?'FAIL':'PASS','accepted'=>count($accepted),'rejected'=>count($rejected),'failures'=>$failures],JSON_THROW_ON_ERROR)."\n";
exit($failures?1:0);
