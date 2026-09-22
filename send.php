<?php
/**
 * Отправка заявки с лендинга.
 * Режимы: MAIL_MODE=test (лог, письмо не шлёт) | real (отправляет).
 * Конфиг: config/managers.php (шаблон) + config/managers.local.php (секреты, в .gitignore)
 *          + переменные окружения (приоритет: env > local > шаблон).
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'self'; base-uri 'none'");

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Только POST-запросы'], JSON_UNESCAPED_UNICODE);
    exit;
}

$root = __DIR__;

/* ---------- Конфигурация ---------- */
$config = [
    'MAIL_MODE' => 'test',                      // test | real
    'TO_EMAIL'  => 'manager@example.ru',        // почта менеджера (в local)
    'FROM_EMAIL'=> 'no-reply@example.ru',       // адрес отправителя
    'SUBJECT'   => 'Новая заявка с лендинга — репетитор английского',
    'SITENAME'  => 'Лендинг — репетитор английского',
];

$localConfig = $root . '/config/managers.local.php';
$baseConfig  = $root . '/config/managers.php';
if (is_file($baseConfig)) {
    $cfg = include $baseConfig;
    if (is_array($cfg)) {
        $config = array_merge($config, $cfg);
    }
}
if (is_file($localConfig)) {
    $cfg = include $localConfig;
    if (is_array($cfg)) {
        $config = array_merge($config, $cfg);
    }
}
// Приоритет: переменные окружения > файлы конфига
foreach (['MAIL_MODE', 'TO_EMAIL', 'FROM_EMAIL', 'SUBJECT', 'SITENAME'] as $envKey) {
    $envVal = getenv($envKey);
    if ($envVal !== false && $envVal !== '') {
        $config[$envKey] = $envVal;
    }
}

/* ---------- Чтение тела (только JSON, лимит размера) ---------- */
$maxBodyBytes = 65536; // 64 КБ
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > $maxBodyBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'message' => 'Запрос слишком большой.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input', false, null, 0, $maxBodyBytes + 1);
if ($raw === false) {
    $raw = '';
}
if (strlen($raw) > $maxBodyBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'message' => 'Запрос слишком большой.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Только JSON: form-urlencoded-фолбэк убран (защита от CSRF-спама чужими формами).
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(415);
    echo json_encode(
        ['ok' => false, 'message' => 'Ожидается JSON с Content-Type: application/json.'],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

/* ---------- Honeypot ---------- */
$company = trim((string)($data['company'] ?? ''));
if ($company !== '') {
    // Бот заполнил скрытое поле — тихо отвечаем ok, письмо не шлём.
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ---------- Rate-limit: ≤5 заявок с IP за 60 сек ---------- */
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$logDir = $root . '/logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
$rateFile = $logDir . '/rate-limit.json';
$now = time();
$window = 60;
$maxPerWindow = 5;

// Весь цикл чтение → проверка → запись под flock (защита от гонки бурста).
$rateFh = @fopen($rateFile, 'c+');
$blocked = false;
if ($rateFh !== false) {
    if (flock($rateFh, LOCK_EX)) {
        $rateRaw = stream_get_contents($rateFh);
        $rateData = json_decode($rateRaw !== false ? $rateRaw : '', true);
        if (!is_array($rateData)) {
            $rateData = [];
        }

        // Чистим мёртвые IP: без активных хитов за окно — ключ удаляем.
        foreach ($rateData as $rateIp => $rateHits) {
            if (!is_array($rateHits)) {
                unset($rateData[$rateIp]);
                continue;
            }
            $alive = array_values(array_filter($rateHits, static fn($t) => is_int($t) && ($now - $t) < $window));
            if ($alive === []) {
                unset($rateData[$rateIp]);
            } elseif ((string)$rateIp === $ip) {
                $rateData[$rateIp] = $alive;
            }
        }

        $hits = isset($rateData[$ip]) && is_array($rateData[$ip]) ? $rateData[$ip] : [];
        if (count($hits) >= $maxPerWindow) {
            $blocked = true;
        } else {
            $hits[] = $now;
            $rateData[$ip] = $hits;
            rewind($rateFh);
            ftruncate($rateFh, 0);
            fwrite($rateFh, json_encode($rateData));
            fflush($rateFh);
        }
        flock($rateFh, LOCK_UN);
    }
    fclose($rateFh);
    @chmod($rateFile, 0600);
} else {
    // Нет файла rate-limit — не блокируем, но фиксируем ошибку доступа.
    @chmod($rateFile, 0600);
}

if ($blocked) {
    http_response_code(429);
    echo json_encode(
        ['ok' => false, 'message' => 'Слишком много заявок с вашего адреса. Подождите минуту или позвоните: +7 (900) 000-00-00.'],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

/* ---------- Валидация ---------- */
$errors = [];

$name = trim((string)($data['name'] ?? ''));
$name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
$name = trim($name);
if ($name === '') {
    $errors[] = 'Укажите имя.';
} elseif (mb_strlen($name) > 120) {
    $errors[] = 'Имя слишком длинное (максимум 120 символов).';
}

$phoneDigits = preg_replace('/\D/', '', (string)($data['phone'] ?? '')) ?? '';
$phoneCount = strlen($phoneDigits);
if ($phoneCount < 10 || $phoneCount > 15) {
    $errors[] = 'Проверьте телефон: нужно от 10 до 15 цифр.';
}

$method = (string)($data['method'] ?? 'call');
$allowedMethods = ['call', 'max', 'vk', 'whatsapp', 'telegram'];
if (!in_array($method, $allowedMethods, true)) {
    $errors[] = 'Выберите способ связи из списка.';
}

$username = trim((string)($data['username'] ?? ''));
$username = preg_replace('/^@+/', '', $username);
$methodsWithUsername = ['max', 'vk', 'whatsapp', 'telegram'];
if (in_array($method, $methodsWithUsername, true)) {
    if ($username === '') {
        $errors[] = 'Укажите ник в мессенджере.';
    } elseif (!preg_match('/^[A-Za-z0-9_]{4,}$/', $username)) {
        $errors[] = 'Ник: только латиница, цифры и «_», минимум 4 символа.';
    }
}

$consent = $data['consent'] ?? null;
$consentOk = ($consent === '1' || $consent === 1 || $consent === true || $consent === 'on');
if (!$consentOk) {
    $errors[] = 'Необходимо согласие на обработку персональных данных.';
}

if ($errors) {
    http_response_code(400);
    echo json_encode(
        ['ok' => false, 'message' => implode(' ', $errors)],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

/* ---------- Лог (режим test) и письмо (режим real) ---------- */
$methodLabels = [
    'call' => 'Перезвонить по телефону',
    'max' => 'Max',
    'vk' => 'ВКонтакте',
    'whatsapp' => 'WhatsApp',
    'telegram' => 'Telegram',
];

$bodyLines = [
    'Имя: ' . $name,
    'Телефон: ' . $phoneDigits,
    'Способ связи: ' . ($methodLabels[$method] ?? $method),
];
if ($username !== '') {
    $bodyLines[] = 'Ник: ' . $username;
}
$bodyLines[] = 'Страница: ' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . ($_SERVER['REQUEST_URI'] ?? '/');
$bodyLines[] = 'Дата: ' . date('Y-m-d H:i:s');
$bodyLines[] = 'IP: ' . $ip;
$body = implode("\n", $bodyLines);

$saved = false;
$logFile = $logDir . '/submissions.log';
$entry = json_encode([
    'ts' => date('c'),
    'ip' => $ip,
    'name' => $name,
    'phone' => $phoneDigits,
    'method' => $method,
    'username' => $username,
], JSON_UNESCAPED_UNICODE);

if ($config['MAIL_MODE'] === 'test') {
    $saved = @file_put_contents($logFile, $entry . "\n", FILE_APPEND | LOCK_EX) !== false;
    if (!$saved) {
        http_response_code(500);
        echo json_encode(
            ['ok' => false, 'message' => 'Не удалось сохранить заявку. Позвоните: +7 (900) 000-00-00.'],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }
    @chmod($logFile, 0600);

    echo json_encode(
        [
            'ok' => true,
            'mode' => 'test',
            'message' => 'Заявка принята (режим test — письмо не отправляется, запись в лог).',
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

/* Режим real */
$headers = 'From: ' . $config['FROM_EMAIL'] . "\r\n" .
    'Reply-To: ' . $config['TO_EMAIL'] . "\r\n" .
    'Content-Type: text/plain; charset=UTF-8' . "\r\n" .
    'X-Mailer: PHP/' . phpversion();

$sent = @mail(
    $config['TO_EMAIL'],
    '=?UTF-8?B?' . base64_encode($config['SUBJECT']) . '?=',
    $body,
    $headers
);

if (!$sent) {
    http_response_code(500);
    echo json_encode(
        ['ok' => false, 'message' => 'Не удалось отправить письмо. Позвоните: +7 (900) 000-00-00.'],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

// Копия в лог — для истории.
@file_put_contents($logFile, $entry . "\n", FILE_APPEND | LOCK_EX);
@chmod($logFile, 0600);

echo json_encode(
    ['ok' => true, 'mode' => 'real', 'message' => 'Заявка отправлена. Перезвоним в течение 2 часов.'],
    JSON_UNESCAPED_UNICODE
);
