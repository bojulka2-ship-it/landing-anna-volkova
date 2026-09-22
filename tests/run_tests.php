<?php
/**
 * Автотесты формы send.php через встроенный веб-сервер PHP.
 * Запуск: php tests/run_tests.php
 * Требуется php >= 8.0 в PATH.
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$sendFile = $root . '/send.php';

if (!is_file($sendFile)) {
    fwrite(STDERR, "FAIL: не найден send.php\n");
    exit(1);
}

/* ---------- Окружение ---------- */
$logDir = $root . '/logs';
@mkdir($logDir, 0755, true);
@unlink($logDir . '/rate-limit.json');
@unlink($logDir . '/submissions.log');

$port = 8976;
$base = 'http://127.0.0.1:' . $port;

$cmd = [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', $root];
$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['file', $logDir . '/test-server.log', 'a'],
    2 => ['file', $logDir . '/test-server.log', 'a'],
];
$server = proc_open($cmd, $descriptors, $pipes, $root);
if (!is_resource($server)) {
    fwrite(STDERR, "FAIL: не удалось запустить php -S\n");
    exit(1);
}

register_shutdown_function(static function () use ($server) {
    if (is_resource($server)) {
        proc_terminate($server);
        proc_close($server);
    }
});

/* Ждём готовности сервера */
$ready = false;
for ($i = 0; $i < 50; $i++) {
    $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
    if ($conn) {
        fclose($conn);
        $ready = true;
        break;
    }
    usleep(100000);
}
if (!$ready) {
    fwrite(STDERR, "FAIL: сервер не поднялся на порту $port\n");
    exit(1);
}

/* ---------- HTTP-клиент ---------- */
function http_post(string $url, array $payload, string $ip = '192.0.2.10'): array
{
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Content-Type: application/json',
                'Content-Length: ' . strlen((string)$body),
            ],
            'content' => $body === false ? '' : $body,
            'timeout' => 5,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#HTTP/\S+\s+(\d{3})#', $h, $m)) {
            $status = (int)$m[1];
        }
    }
    $decoded = json_decode((string)$raw, true);
    return [$status, is_array($decoded) ? $decoded : ['ok' => false, 'message' => (string)$raw]];
}

function http_get(string $url): int
{
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 5,
            'ignore_errors' => true,
        ],
    ]);
    @file_get_contents($url, false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#HTTP/\S+\s+(\d{3})#', $h, $m)) {
            $status = (int)$m[1];
        }
    }
    return $status;
}

function send_req(array $payload, string $ip = '192.0.2.10'): array
{
    global $base;
    // IP подменить нельзя (берётся из REMOTE_ADDR), поэтому изоляция —
    // через очистку rate-limit лога перед каждой логической группой.
    return http_post($base . '/send.php', $payload, $ip);
}

$pass = 0;
$fail = 0;
$failures = [];

function check(string $name, bool $cond, string $info = ''): void
{
    global $pass, $fail, $failures;
    if ($cond) {
        $pass++;
        echo "  PASS  $name\n";
    } else {
        $fail++;
        $failures[] = $name;
        echo "  FAIL  $name" . ($info !== '' ? " — $info" : '') . "\n";
    }
}

function valid_payload(): array
{
    return [
        'name' => 'Мария',
        'phone' => '+7 (999) 123-45-67',
        'method' => 'telegram',
        'username' => 'maria_ivanova',
        'consent' => '1',
        'company' => '',
    ];
}

function clear_rate(): void
{
    global $logDir;
    @unlink($logDir . '/rate-limit.json');
}

echo "=== Тесты формы send.php (php -S) ===\n";

/* --- 1. Валидная заявка, режим test --- */
clear_rate();
[$status, $body] = send_req(valid_payload());
check('валидная заявка → HTTP 200', $status === 200, "получено $status");
check('валидная заявка → ok=true', ($body['ok'] ?? false) === true, json_encode($body, JSON_UNESCAPED_UNICODE));
check('ответ содержит mode=test', ($body['mode'] ?? '') === 'test', json_encode($body, JSON_UNESCAPED_UNICODE));

$logContent = @file_get_contents($logDir . '/submissions.log') ?: '';
check('заявка записана в logs/submissions.log', str_contains($logContent, 'Мария'));

/* --- 2. Отсутствие согласия --- */
clear_rate();
$p = valid_payload();
unset($p['consent']);
[$status, $body] = send_req($p);
check('без согласия → HTTP 400', $status === 400, "получено $status");
check('без согласия → ok=false', ($body['ok'] ?? true) === false);
check('сообщение об ошибке согласия на русском', str_contains((string)($body['message'] ?? ''), 'согласи'));

$p = valid_payload();
$p['consent'] = '0';
[$status, $body] = send_req($p);
check('consent=0 → HTTP 400', $status === 400, "получено $status");

/* --- 3. Honeypot --- */
clear_rate();
@unlink($logDir . '/submissions.log');
$p = valid_payload();
$p['company'] = 'Спам-ООО';
[$status, $body] = send_req($p);
check('honeypot заполнен → HTTP 200', $status === 200, "получено $status");
check('honeypot → ok=true (тихий ответ)', ($body['ok'] ?? false) === true);
$logAfter = @file_get_contents($logDir . '/submissions.log');
check('honeypot → письмо/лог не создан', $logAfter === false || $logAfter === '');

/* --- 4. Валидация имени --- */
clear_rate();
$p = valid_payload();
$p['name'] = '';
[$status] = send_req($p);
check('пустое имя → HTTP 400', $status === 400, "получено $status");

$p = valid_payload();
$p['name'] = str_repeat('а', 121);
[$status] = send_req($p);
check('имя 121 символ → HTTP 400', $status === 400, "получено $status");

/* --- 5. Валидация телефона --- */
clear_rate();
$p = valid_payload();
$p['phone'] = '123';
[$status] = send_req($p);
check('телефон 3 цифры → HTTP 400', $status === 400, "получено $status");

clear_rate();
$p = valid_payload();
$p['phone'] = '+7 (999) 123-45-6'; // 10 цифр — допустимо (10–15)
[$status] = send_req($p);
check('телефон 10 цифр → HTTP 200', $status === 200, "получено $status");

clear_rate();
$p = valid_payload();
$p['phone'] = '12345678901234567890'; // 20 цифр
[$status] = send_req($p);
check('телефон 20 цифр → HTTP 400', $status === 400, "получено $status");

/* --- 6. Ник в мессенджере --- */
clear_rate();
$p = valid_payload();
$p['username'] = 'ab';
[$status] = send_req($p);
check('ник 2 символа → HTTP 400', $status === 400, "получено $status");

$p = valid_payload();
$p['username'] = 'абвгд';
[$status] = send_req($p);
check('ник кириллицей → HTTP 400', $status === 400, "получено $status");

$p = valid_payload();
$p['username'] = '';
[$status] = send_req($p);
check('пустой ник при telegram → HTTP 400', $status === 400, "получено $status");

clear_rate();
$p = valid_payload();
$p['method'] = 'call';
unset($p['username']);
[$status] = send_req($p);
check('способ «перезвонить» без ника → HTTP 200', $status === 200, "получено $status");

/* --- 7. Некорректный способ связи --- */
clear_rate();
$p = valid_payload();
$p['method'] = 'signal';
[$status] = send_req($p);
check('неизвестный способ связи → HTTP 400', $status === 400, "получено $status");

/* --- 8. Rate-limit: ≤5 за 60 сек --- */
clear_rate();
$statuses = [];
for ($i = 0; $i < 6; $i++) {
    $p = valid_payload();
    $p['name'] = 'Тест' . $i;
    [$st] = send_req($p);
    $statuses[] = $st;
}
$firstFiveOk = count(array_filter(array_slice($statuses, 0, 5), static fn($s) => $s === 200)) === 5;
check('rate-limit: первые 5 заявок → 200', $firstFiveOk, json_encode($statuses));
check('rate-limit: 6-я заявка за 60 сек → 429', ($statuses[5] ?? 0) === 429, json_encode($statuses));

/* --- 9. GET → 405 --- */
clear_rate();
$status = http_get($base . '/send.php');
check('GET-запрос → HTTP 405', $status === 405, "получено $status");

/* --- 10. Пустое тело --- */
clear_rate();
[$status, $body] = send_req([]);
check('пустое тело → HTTP 400', $status === 400, "получено $status");
check('пустое тело → ok=false', ($body['ok'] ?? true) === false);

/* --- Итог --- */
echo "\n==============================\n";
echo "Итого: PASS=$pass, FAIL=$fail\n";
if ($fail > 0) {
    echo "Упавшие тесты:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
    proc_terminate($server);
    exit(1);
}
echo "Все тесты пройдены (100% PASS).\n";
proc_terminate($server);
exit(0);
