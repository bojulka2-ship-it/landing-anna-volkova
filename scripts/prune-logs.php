<?php
/**
 * Очистка ПДн-лога и rate-limit от устаревших записей.
 * Запуск: php scripts/prune-logs.php [дни]
 * По умолчанию удаляет записи старше 90 дней из submissions.log
 * и вычищает rate-limit.json (мёртвые окна).
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$logDir = $root . '/logs';
$days = isset($argv[1]) ? max(1, (int)$argv[1]) : 90;
$cutoff = time() - $days * 86400;

/* --- submissions.log: JSONL, поле ts (ISO8601) --- */
$logFile = $logDir . '/submissions.log';
$removed = 0;
$kept = 0;
if (is_file($logFile)) {
    $lines = file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines !== false) {
        $alive = [];
        foreach ($lines as $line) {
            $row = json_decode($line, true);
            if (!is_array($row) || !isset($row['ts'])) {
                $removed++; // битые строки
                continue;
            }
            $ts = strtotime((string)$row['ts']);
            if ($ts === false || $ts < $cutoff) {
                $removed++;
                continue;
            }
            $alive[] = $line;
            $kept++;
        }
        if ($removed > 0) {
            file_put_contents($logFile, $alive === [] ? '' : implode("\n", $alive) . "\n", LOCK_EX);
            @chmod($logFile, 0600);
        }
    }
}

/* --- rate-limit.json: только живые окна --- */
$rateFile = $logDir . '/rate-limit.json';
$rateRemoved = 0;
if (is_file($rateFile)) {
    $now = time();
    $data = json_decode((string)file_get_contents($rateFile), true);
    if (is_array($data)) {
        foreach ($data as $ip => $hits) {
            if (!is_array($hits)) {
                unset($data[$ip]);
                $rateRemoved++;
                continue;
            }
            $aliveHits = array_values(array_filter($hits, static fn($t) => is_int($t) && ($now - $t) < 60));
            if ($aliveHits === []) {
                unset($data[$ip]);
                $rateRemoved++;
            } else {
                $data[$ip] = $aliveHits;
            }
        }
        file_put_contents($rateFile, json_encode($data), LOCK_EX);
        @chmod($rateFile, 0600);
    }
}

echo "prune-logs: удалено записей лога $removed, оставлено $kept, ключей rate-limit снято $rateRemoved (окно $days дн.)\n";
