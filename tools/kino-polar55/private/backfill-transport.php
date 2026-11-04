<?php
declare(strict_types=1);
final class LabSourceRetry extends RuntimeException {
    public function __construct(public readonly int $retryAfter){parent::__construct('source_temporarily_unavailable');}
}
function labRetryAfter(string $header,int $now):int {
    if(ctype_digit($header)) {
        if(strlen($header)>6)throw new RuntimeException('retry_window_requires_review');
        $value=(int)$header;
    }else {
        $time=strtotime($header);if($time===false)throw new RuntimeException('invalid_retry_after');
        $value=max(0,$time-$now);
    }
    if($value>604800)throw new RuntimeException('retry_window_requires_review');
    return max(60,$value);
}
/** Fixed source, one two-record request, no cookie, redirect or automatic retry. */
function labRangeGet(int $lo,int $hi,int $page):array {
    if($lo<1||$hi<$lo||$hi-$lo>999||$page<0||$page>1000)throw new RuntimeException('invalid_range');
    $url='https://api.opap.gr/draws/v3.0/1100/draw-id/'.$lo.'/'.$hi.'?limit=2&page='.$page;
    $ch=curl_init($url);if(!$ch)throw new RuntimeException('transport_unavailable');
    $body='';$retryAfter=60;
    curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>14,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_USERAGENT=>'PromptBeatsKinoHistory/1.0 (bounded approved collection)',CURLOPT_HTTPHEADER=>['Accept: application/json'],CURLOPT_WRITEFUNCTION=>static function($ch,$chunk)use(&$body){if(strlen($body)+strlen($chunk)>131072)return 0;$body.=$chunk;return strlen($chunk);},CURLOPT_HEADERFUNCTION=>static function($ch,$line)use(&$retryAfter){if(preg_match('/^Retry-After:\s*(.*?)\s*$/i',$line,$m))$retryAfter=max($retryAfter,labRetryAfter($m[1],time()));return strlen($line);}]);
    $ok=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$type=(string)curl_getinfo($ch,CURLINFO_CONTENT_TYPE);curl_close($ch);
    if($status===429||$status>=500||$status===0)throw new LabSourceRetry($retryAfter);
    if($ok===false||$status!==200||!preg_match('~^application/json\b~i',$type))throw new RuntimeException('source_rejected');
    $json=json_decode($body,true,32,JSON_THROW_ON_ERROR);if(!is_array($json))throw new RuntimeException('invalid_page');return $json;
}
