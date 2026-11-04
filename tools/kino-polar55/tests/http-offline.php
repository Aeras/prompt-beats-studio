<?php
declare(strict_types=1);
$root=sys_get_temp_dir().'/kino-http-'.bin2hex(random_bytes(8));
mkdir($root,0700);mkdir($root.'/kino-api',0700);mkdir($root.'/kino-private',0700);mkdir($root.'/kino-private/.lab-runtime',0700);
foreach(['lab-core.php','lab-service.php']as $file)copy(__DIR__.'/../private/'.$file,$root.'/kino-private/'.$file);
$token=str_repeat('synthetic_test_only_',4);
file_put_contents($root.'/kino-private/lab-config.php','<?php return '.var_export(['enabled'=>false,'schema_verified'=>false,'read_token'=>$token],true).';');
// Test harness alone supplies TLS/Host: never included in the deployment package.
file_put_contents($root.'/kino-api/lab-v1.php',"<?php \$_SERVER['HTTPS']='on'; \$_SERVER['HTTP_HOST']='kino-api.promptbeats.app'; require ".var_export(realpath(__DIR__.'/../public/lab-v1.php'),true).';');
// Endpoint path must resolve its sibling private tree: copy the real endpoint instead.
$endpoint=file_get_contents(__DIR__.'/../public/lab-v1.php');
file_put_contents($root.'/kino-api/actual.php',$endpoint);
file_put_contents($root.'/kino-api/lab-v1.php',"<?php \$_SERVER['HTTPS']='on'; \$_SERVER['HTTP_HOST']='kino-api.promptbeats.app'; require __DIR__.'/actual.php';");
$server=proc_open([PHP_BINARY,'-S','127.0.0.1:18459','-t',$root.'/kino-api'],[['pipe','r'],['file',$root.'/out.log','a'],['file',$root.'/err.log','a']],$pipes);
try {
    for($i=0;$i<100;$i++){$s=@fsockopen('127.0.0.1',18459,$e,$m,.1);if($s){fclose($s);break;}usleep(10000);}
    $call=static function(array $headers,string $body='{"op":"status"}',string $method='POST'):int {
        $context=stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",array_merge(['Content-Type: application/json'],$headers)),'content'=>$body,'ignore_errors'=>true,'timeout'=>3]]);
        file_get_contents('http://127.0.0.1:18459/lab-v1.php',false,$context);
        preg_match('/\s(\d{3})\s/',$http_response_header[0],$m);return (int)$m[1];
    };
    $auth=['Authorization: Bearer '.$token,'X-Kino-Owner: '.str_repeat('a',64)];
    foreach([
        [$call([]),401,'no_secret'],
        [$call(['Authorization: Bearer wrong']),401,'wrong_secret'],
        [$call([...$auth,'Origin: https://attacker.test']),403,'no_browser_origin'],
        [$call($auth,'{}','GET'),405,'method'],
        [$call($auth,'{"op":"analysis","n":-1}'),400,'strict_input'],
        [$call($auth),503,'configuration_fail_closed'],
        [$call($auth),429,'cross_request_rate_limit'],
    ]as [$got,$wanted,$name])if($got!==$wanted)throw new RuntimeException($name.': '.$got.' != '.$wanted);
    echo "HTTP_OFFLINE_PASS\n";
}finally{proc_terminate($server);proc_close($server);}
