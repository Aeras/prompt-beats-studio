<?php
declare(strict_types=1);

/** Additive analytics only. Does not load the manager/config or contact OPAP. */
function labRow(array $r): array {
    $id = filter_var($r['draw_id'] ?? null, FILTER_VALIDATE_INT);
    $ms = filter_var($r['draw_time_ms'] ?? null, FILTER_VALIDATE_INT);
    $nums = json_decode((string)($r['main_numbers_json'] ?? ''), true, 32, JSON_THROW_ON_ERROR);
    $bonus = $r['bonus_number'] === null ? null : filter_var($r['bonus_number'], FILTER_VALIDATE_INT);
    $second = $r['second_chance_json'] === null ? null : json_decode($r['second_chance_json'], true, 32, JSON_THROW_ON_ERROR);
    if (!$id || $id < 1 || $id > 9007199254740991 || !$ms || $ms < 1000000000000 || $ms >= 4100000000000 || !is_array($nums) || !array_is_list($nums) || count($nums) !== 20 || count(array_unique($nums)) !== 20) throw new RuntimeException('invalid_row');
    foreach ($nums as $n) if (!is_int($n) || $n < 1 || $n > 80) throw new RuntimeException('invalid_row');
    if ($bonus !== null && (!is_int($bonus) || !in_array($bonus, $nums, true))) throw new RuntimeException('invalid_bonus');
    if ($second !== null) {
        if (!is_array($second) || !array_is_list($second) || count($second) !== 3 || count(array_unique($second)) !== 3) throw new RuntimeException('invalid_second');
        foreach ($second as $n) if (!is_int($n) || $n < 1 || $n > 80 || in_array($n, $nums, true)) throw new RuntimeException('invalid_second');
    }
    $content = json_encode(['drawId'=>$id,'drawTime'=>$ms,'list'=>$nums,'bonus'=>$bonus,'secondChance'=>$second], JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    if (!is_string($r['content_sha256'] ?? null) || !hash_equals(hash('sha256', $content), $r['content_sha256'])) throw new RuntimeException('hash_mismatch');
    sort($nums, SORT_NUMERIC);
    return ['id'=>$id,'time'=>$ms,'numbers'=>$nums];
}

function labRank(array $counts, int $n, int $k): array {
    $rank = range(1,80);
    usort($rank, static fn($a,$b) => $counts[$b-1] <=> $counts[$a-1] ?: $a <=> $b);
    $p = array_slice($rank,0,$k); sort($p,SORT_NUMERIC); return $p;
}

/** ASCII seeds are required by this wire contract; identical JS 32-bit operations. */
function labRandom(int $k, string $seed): array {
    if ($k < 1 || $k > 80 || !preg_match('/^[\x20-\x7E]{1,200}$/D',$seed)) throw new RuntimeException('invalid_seed');
    $x=2166136261;
    foreach (str_split($seed) as $c) $x=(($x ^ ord($c))*16777619)&0xffffffff;
    if (!$x) $x=1;
    $a=range(1,80);
    for ($i=79;$i>0;$i--) {
        $x=($x ^ (($x << 13)&0xffffffff))&0xffffffff;
        $x=($x ^ ($x >> 17))&0xffffffff;
        $x=($x ^ (($x << 5)&0xffffffff))&0xffffffff;
        $j=(int)floor(($x/4294967296)*($i+1));
        [$a[$i],$a[$j]]=[$a[$j],$a[$i]];
    }
    $a=array_slice($a,0,$k);sort($a,SORT_NUMERIC);return $a;
}

/** Ascending (time,id) stream; memory bounded independently of total history size. */
function labAggregate(iterable $draws, string $method, int $k, string $seed): array {
    if (!in_array($method,['P00','F00','P01'],true) || !in_array($k,[5,8,10],true)) throw new RuntimeException('invalid_options');
    labRandom($k,$seed);
    $counts=$training=$recent=array_fill(0,80,0);$gaps=array_fill(0,80,null);
    $ring=[];$groupCounts=array_fill(0,80,0);$groupN=0;$groupLast=[];
    $results=[];$n=0;$trainN=0;$odd=0;$low=0;$overlaps=0;$last=null;$first=null;$excluded=0;
    foreach ($draws as $d) {
        if ($last !== null && ($d['time'] < $last['time'] || ($d['time'] === $last['time'] && $d['id'] <= $last['id']))) throw new RuntimeException('invalid_order');
        if ($last !== null && $d['time'] !== $last['time']) {
            foreach ($training as $i=>$v) $training[$i]+=$groupCounts[$i];
            $trainN+=$groupN;
            foreach ($groupLast as $item) {
                $ring[]=$item;
                foreach ($item as $v) $recent[$v-1]++;
                if (count($ring)>100) foreach (array_shift($ring) as $v) $recent[$v-1]--;
            }
            $groupCounts=array_fill(0,80,0);$groupN=0;$groupLast=[];
        }
        if ($trainN < 30) $excluded++;
        elseif (count($results)<500) {
            $baseline=labRank($training,$trainN,$k);
            $selected=$method==='P00'?labRandom($k,$seed.':'.$d['id']):labRank($method==='P01'?$recent:$training,$method==='P01'?count($ring):$trainN,$k);
            $m=count(array_intersect($selected,$baseline));
            $results[]=['drawId'=>$d['id'],'cutoff'=>$d['time'],'trainingCount'=>$trainN,'selected'=>$selected,'baseline'=>$baseline,'hits'=>count(array_intersect($selected,$d['numbers'])),'comparatorHits'=>count(array_intersect($baseline,$d['numbers'])),'pairedNullVariance'=>2*($k-$m)*.25*.75*80/79];
        }
        foreach ($gaps as $i=>$gap) if ($gap !== null) $gaps[$i]++;
        foreach ($d['numbers'] as $v) {$counts[$v-1]++;$groupCounts[$v-1]++;$gaps[$v-1]=0;if($v%2)$odd++;if($v<=40)$low++;}
        $groupLast[]=$d['numbers'];if(count($groupLast)>100)array_shift($groupLast);
        $groupN++;$n++;
        if ($last !== null) $overlaps+=count(array_intersect($last['numbers'],$d['numbers']));
        if ($first===null) $first=$d;
        $last=$d;
    }
    $expected=$n/4;$dispersion=0.;
    if($expected)foreach($counts as $c)$dispersion+=($c-$expected)**2/$expected;
    // Proposal uses all selected observations, including the final equal-time group.
    foreach($groupLast as $item){$ring[]=$item;foreach($item as $v)$recent[$v-1]++;if(count($ring)>100)foreach(array_shift($ring) as $v)$recent[$v-1]--;}
    $r=count($results);$mean=$r?array_sum(array_column($results,'hits'))/$r:null;
    return [
        'stats'=>['n'=>$n,'counts'=>$counts,'gaps'=>$gaps,'expected'=>$expected,'odd'=>$odd,'even'=>$n*20-$odd,'low'=>$low,'high'=>$n*20-$low,'observedNeighborOverlap'=>$n>1?$overlaps/($n-1):null,'dispersion'=>$expected?$dispersion:null],
        'proposal'=>$n?($method==='P00'?labRandom($k,$seed):labRank($method==='P01'?$recent:$counts,$n,$k)):[],
        'backtest'=>['n'=>$r,'warmupExcluded'=>$excluded,'meanHits'=>$mean,'uniformExpected'=>$k/4,'uniformLift'=>$mean===null?null:$mean-$k/4,'pairedDiff'=>$r?(array_sum(array_column($results,'hits'))-array_sum(array_column($results,'comparatorHits')))/$r:null,'results'=>$results],
        'first'=>$first===null?null:['id'=>$first['id'],'time'=>$first['time']],
        'last'=>$last===null?null:['id'=>$last['id'],'time'=>$last['time']],
    ];
}
