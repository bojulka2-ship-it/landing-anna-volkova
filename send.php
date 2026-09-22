<?php
/**
 * Отправка заявки с лендинга.
 * Режимы: MAIL_MODE=test (лог, письмо не шлёт) | real (отправляет).
 * Конфиг: config/managers.php (шаблон) + config/managers.local.php (секреты, в .gitignore).
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

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

/* ---------- Чтение тела ---------- */
$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
    // Фолбэк: обычный form-post
    $data = $_POST;
}
if (!is_array($data)) {
    $data = [];
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
// Приведение IPv6 к IPv4-подобному ключу не требуется — достаточно хранить как есть.
$logDir = $root . '/logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
$rateFile = $logDir . '/rate-limit.json';
$now = time();
$window = 60;
$maxPerWindow = 5;

$rateData = [];
if (is_file($rateFile)) {
    $decoded = json_decode((string)file_get_contents($rateFile), true);
    if (is_array($decoded)) {
        $rateData = $decoded;
    }
}

$hits = isset($rateData[$ip]) && is_array($rateData[$ip]) ? $rateData[$ip] : [];
$hits = array_values(array_filter($hits, static fn($t) => is_int($t) && ($now - $t) < $window));

if (count($hits) >= $maxPerWindow) {
    http_response_code(429);
    echo json_encode(
        ['ok' => false, 'message' => 'Слишком много заявок с вашего адреса. Подождите минуту или позвоните: +7 (900) 000-00-00.'],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}
$hits[] = $now;
$rateData[$ip] = $hits;
@file_put_contents($rateFile, json_encode($rateData), LOCK_EX);

/* ---------- Валидация ---------- */
$errors = [];

$name = trim((string)($data['name'] ?? ''));
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
if ($config['MAIL_MODE'] === 'test') {
    $logFile = $logDir . '/submissions.log';
    $entry = json_encode([
        'ts' => date('c'),
        'ip' => $ip,
        'name' => $name,
        'phone' => $phoneDigits,
        'method' => $method,
        'username' => $username,
    ], JSON_UNESCAPED_UNICODE);
    $saved = @file_put_contents($logFile, $entry . "\n", FILE_APPEND | LOCK_EX) !== false;

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
@file_put_contents(
    $logDir . '/submissions.log',
    json_encode(['ts' => date('c'), 'ip' => $ip, 'name' => $name, 'phone' => $phoneDigits, 'method' => $method, 'username' => $username], JSON_UNESCAPED_UNICODE) . "\n",
    FILE_APPEND | LOCK_EX
);

echo json_encode(
    ['ok' => true, 'mode' => 'real', 'message' => 'Заявка отправлена. Перезвоним в течение 2 часов.'],
    JSON_UNESCAPED_UNICODE
);
