/* Маска телефона, условные поля, согласие, отправка формы. */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {
    API_URL: "/send.php",
    IS_GITHUB_PAGES: false,
    DEMO_PAGE: "zayavka.html",
    PHONE_DISPLAY: "+7 (900) 000-00-00"
  };

  var PHONE_PLACEHOLDER = "+7 (900) 000-00-00";

  /* --- Год в футере --- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* --- Демо-режим GitHub Pages --- */
  if (CFG.IS_GITHUB_PAGES) {
    var footerDemo = document.getElementById("footer-demo-link");
    if (footerDemo) footerDemo.hidden = false;
    var badge = document.getElementById("demo-badge");
    if (badge) badge.hidden = false;
  }

  var form = document.getElementById("lead-form");
  if (!form) return;

  var phoneInput = document.getElementById("phone");
  var methodSelect = document.getElementById("method");
  var usernameRow = document.getElementById("username-row");
  var usernameInput = document.getElementById("username");
  var consentInput = document.getElementById("consent");
  var messageEl = document.getElementById("form-message");
  var submitBtn = document.getElementById("submit-btn");

  /* --- Маска телефона: +7 (XXX) XXX-XX-XX, ровно 11 цифр --- */
  function maskPhone(value) {
    var digits = value.replace(/\D/g, "");
    if (digits.charAt(0) === "8") digits = "7" + digits.slice(1);
    if (digits.charAt(0) !== "7") digits = "7" + digits;
    digits = digits.slice(0, 11);

    var out = "+7";
    if (digits.length > 1) out += " (" + digits.slice(1, 4);
    if (digits.length >= 4) out += ") " + digits.slice(4, 7);
    if (digits.length >= 7) out += "-" + digits.slice(7, 9);
    if (digits.length >= 9) out += "-" + digits.slice(9, 11);
    return out;
  }

  function phoneDigits() {
    return phoneInput.value.replace(/\D/g, "");
  }

  phoneInput.addEventListener("input", function () {
    var pos = phoneInput.selectionStart;
    var before = phoneInput.value;
    phoneInput.value = maskPhone(phoneInput.value);
    if (pos !== null && phoneInput.value.length >= before.length) {
      phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
    }
    clearFieldError(phoneInput);
  });

  phoneInput.addEventListener("focus", function () {
    if (!phoneInput.value) phoneInput.value = "+7 (";
  });

  phoneInput.addEventListener("blur", function () {
    if (phoneInput.value === "+7 (" || phoneInput.value === "+7") {
      phoneInput.value = "";
    }
  });

  /* --- Условное поле ника --- */
  var METHODS_WITH_USERNAME = { max: true, vk: true, whatsapp: true, telegram: true };

  function syncUsernameRow() {
    var need = !!METHODS_WITH_USERNAME[methodSelect.value];
    usernameRow.hidden = !need;
    usernameInput.required = need;
    if (!need) {
      usernameInput.value = "";
      clearFieldError(usernameInput);
    }
  }

  methodSelect.addEventListener("change", syncUsernameRow);
  syncUsernameRow();

  usernameInput.addEventListener("input", function () {
    clearFieldError(usernameInput);
  });

  document.getElementById("name").addEventListener("input", function () {
    clearFieldError(this);
  });

  /* --- Сообщения --- */
  function showMessage(text, type, isDemo) {
    messageEl.hidden = false;
    messageEl.className = "form-message " + (type === "success" ? "is-success" : "is-error");
    messageEl.textContent = "";
    if (isDemo) {
      var tag = document.createElement("span");
      tag.className = "demo-tag";
      tag.textContent = "демо-режим";
      messageEl.appendChild(tag);
    }
    messageEl.appendChild(document.createTextNode(text));
    if (isDemo) {
      messageEl.appendChild(document.createTextNode(" "));
      var link = document.createElement("a");
      link.href = CFG.DEMO_PAGE;
      link.textContent = "Открыть пример письма менеджеру";
      messageEl.appendChild(link);
    }
  }

  function hideMessage() {
    messageEl.hidden = true;
    messageEl.textContent = "";
  }

  function setFieldError(field) {
    field.setAttribute("aria-invalid", "true");
  }

  function clearFieldError(field) {
    field.removeAttribute("aria-invalid");
  }

  /* --- Валидация на клиенте --- */
  function validate() {
    var errors = [];

    var nameInput = document.getElementById("name");
    var name = nameInput.value.trim();
    if (!name) {
      errors.push("Укажите имя.");
      setFieldError(nameInput);
    } else if (name.length > 120) {
      errors.push("Имя слишком длинное (максимум 120 символов).");
      setFieldError(nameInput);
    }

    var digits = phoneDigits();
    if (digits.length !== 11) {
      errors.push("Введите телефон полностью: 11 цифр в формате " + PHONE_PLACEHOLDER + ".");
      setFieldError(phoneInput);
    }

    if (METHODS_WITH_USERNAME[methodSelect.value]) {
      var u = normalizeUsername(usernameInput.value);
      if (!/^[A-Za-z0-9_]{4,}$/.test(u)) {
        errors.push("Укажите ник в мессенджере: латиница, цифры и «_», минимум 4 символа (например: anna_ivanova).");
        setFieldError(usernameInput);
      }
    }

    if (!consentInput.checked) {
      errors.push("Отметьте согласие на обработку персональных данных.");
    }

    return errors;
  }

  /* --- Отправка --- */
  /* Ведущий «@» из плейсхолдера допустим: @user == user */
  function normalizeUsername(value) {
    return value.trim().replace(/^@+/, "");
  }

  function buildPayload() {
    var method = methodSelect.value;
    var payload = {
      name: document.getElementById("name").value.trim(),
      phone: phoneInput.value,
      method: method,
      consent: consentInput.checked ? "1" : "0",
      company: document.getElementById("company").value
    };
    if (METHODS_WITH_USERNAME[method]) {
      payload.username = normalizeUsername(usernameInput.value);
    }
    return payload;
  }

  function renderSuccess(isDemo) {
    if (isDemo) {
      showMessage(
        "Заявка принята (демо). На реальном хостинге она уйдёт менеджеру. ",
        "success",
        true
      );
    } else {
      showMessage(
        "Спасибо! Заявка отправлена. Перезвоню в течение 2 часов. Если нужно срочно — позвоните: " +
          PHONE_PLACEHOLDER + ".",
        "success",
        false
      );
    }
    resetForm();
  }

  /* Явная очистка: form.reset() не всегда убирает значение у tel-поля с маской */
  function resetForm() {
    form.reset();
    var nameInput = document.getElementById("name");
    var companyInput = document.getElementById("company");
    nameInput.value = "";
    phoneInput.value = "";
    usernameInput.value = "";
    companyInput.value = "";
    methodSelect.value = "call";
    consentInput.checked = false;
    clearFieldError(nameInput);
    clearFieldError(phoneInput);
    clearFieldError(usernameInput);
    syncUsernameRow();
    if (document.activeElement === phoneInput || document.activeElement === nameInput) {
      document.activeElement.blur();
    }
  }

  function renderError(userMessage) {
    var text =
      userMessage +
      " Если проблема повторяется — позвоните: " +
      PHONE_PLACEHOLDER +
      ".";
    showMessage(text, "error", false);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    hideMessage();

    var errors = validate();
    if (errors.length > 0) {
      showMessage(errors.join(" "), "error", false);
      var invalid = form.querySelector('[aria-invalid="true"]');
      if (invalid) invalid.focus();
      else if (!consentInput.checked) consentInput.focus();
      return;
    }

    var payload = buildPayload();

    /* Демо-режим: имитируем приём, ничего не отправляем */
    if (CFG.IS_GITHUB_PAGES) {
      submitBtn.disabled = true;
      window.setTimeout(function () {
        submitBtn.disabled = false;
        renderSuccess(true);
      }, 400);
      return;
    }

    submitBtn.disabled = true;
    var originalText = submitBtn.textContent;
    submitBtn.textContent = "Отправляем…";

    fetch(CFG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        if (result.status === 429) {
          renderError("Слишком много заявок с вашего адреса, подождите минуту.");
          return;
        }
        if (!result.ok || !result.data || !result.data.ok) {
          var msg =
            result.data && result.data.message
              ? result.data.message
              : "Не удалось отправить заявку.";
          renderError(msg);
          return;
        }
        renderSuccess(false);
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        renderError("Сетевая ошибка, заявка не отправлена.");
      });
  });
})();
