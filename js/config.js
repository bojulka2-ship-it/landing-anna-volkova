/* Точка смены бэкенда. Меняется одна строка API_URL. */
(function () {
  "use strict";

  // "/send.php"  — PHP-хостинг (основной для РФ, данные не покидают РФ)
  // "/api/submit" — опциональный Node-бэкенд
  var API_URL = "/send.php";

  // Авто-детект GitHub Pages: форма имитирует приём (демо-режим), ничего не отправляет.
  var IS_GITHUB_PAGES = /\.github\.io$/i.test(window.location.hostname);

  window.SITE_CONFIG = {
    API_URL: API_URL,
    IS_GITHUB_PAGES: IS_GITHUB_PAGES,
    DEMO_PAGE: "zayavka.html",
    PHONE_DISPLAY: "+7 (900) 000-00-00"
  };
})();
