<?php
declare(strict_types=1);
// Separate private file. Never overwrite config.php or reuse its health token/writer.
return [
    'enabled'=>false,
    'schema_verified'=>false,
    'read_token'=>'',
    'database'=>['host'=>'localhost','name'=>'promptbe_kino_history','user'=>'','password'=>''],
];
