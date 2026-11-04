<?php
declare(strict_types=1);
ini_set('display_errors','0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
function labReply(int $status,array $body):never {http_response_code($status);echo json_encode($body,JSON_THROW_ON_ERROR);exit;}
if(($_SERVER['REQUEST_METHOD']??'')!=='POST')labReply(405,['error'=>'method_not_allowed']);
if(strtolower($_SERVER['HTTP_HOST']??'')!=='kino-api.promptbeats.app'||!in_array(strtolower($_SERVER['HTTPS']??''),['on','1'],true)||isset($_SERVER['HTTP_ORIGIN']))labReply(403,['error'=>'not_allowed']);
try {
    $private=dirname(__DIR__).'/kino-private';
    $config=require $private.'/lab-config.php';
    $token=$config['read_token']??'';
    $auth=$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'';
    if(!is_string($token)||!preg_match('/^[a-zA-Z0-9_-]{48,256}$/D',$token))labReply(503,['error'=>'unavailable']);
    if(!is_string($auth)||!hash_equals('Bearer '.$token,$auth))labReply(401,['error'=>'unauthorized']);
    $owner=$_SERVER['HTTP_X_KINO_OWNER']??'';
    if(!preg_match('/^[a-f0-9]{64}$/D',$owner))labReply(400,['error'=>'invalid_request']);
    $body=file_get_contents('php://input',false,null,0,2049);
    if(!is_string($body)||strlen($body)>2048)labReply(413,['error'=>'invalid_request']);
    require_once $private.'/lab-service.php';
    try {$request=labRequest(json_decode($body,true,16,JSON_THROW_ON_ERROR));}catch(Throwable){labReply(400,['error'=>'invalid_request']);}
    $storage=$private.'/.lab-runtime';
    if(!is_dir($storage)||!is_writable($storage))labReply(503,['error'=>'unavailable']);
    // Single host, cross-process admission. Unauthenticated input never creates lock files.
    $lock=fopen($storage.'/analysis.lock','c+');
    if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))labReply(429,['error'=>'busy']);
    try {
        if(!labReadAdmission($lock,microtime(true)))labReply(429,['error'=>'busy']);
        $db=labReadDb($config);
        $result=labReadAnalysis($db,$request,$storage);
        labReadAudit($storage,$owner,$request['op'],'ok');
        labReply(200,$result);
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}catch(Throwable){error_log('KINO lab: operation unavailable');labReply(503,['error'=>'unavailable']);}
