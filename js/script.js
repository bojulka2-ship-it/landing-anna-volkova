/* Маска телефона, условные поля, согласие, отправка формы. */
(function () {
  "use strict";

  var CORE = window.SITE_CORE;
  if (!CORE) {
    console.error("SITE_CORE не загружен: подключите js/core.js до js/script.js");
    return;
  }

  var CFG = window.SITE_CONFIG || {
    API_URL: "/send.php",
    IS_GITHUB_PAGES: false,
    DEMO_PAGE: "zayavka.html",
    PHONE_DISPLAY: "+7 (900) 000-00-00"
  };

  var PHONE_PLACEHOLDER = CORE.PHONE_PLACEHOLDER;

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

  /* --- Маска телефона --- */
  phoneInput.addEventListener("input", function () {
    var pos = phoneInput.selectionStart;
    var before = phoneInput.value;
    phoneInput.value = CORE.maskPhone(phoneInput.value);
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
  function syncUsernameRow() {
    var need = CORE.needsUsername(methodSelect.value);
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

  var FIELD_INPUTS = null;

  function fieldInput(name) {
    if (!FIELD_INPUTS) {
      FIELD_INPUTS = {
        name: document.getElementById("name"),
        phone: phoneInput,
        username: usernameInput,
        consent: consentInput
      };
    }
    return FIELD_INPUTS[name];
  }

  /* --- Валидация: правила в js/core.js, разметка ошибок здесь --- */
  function validate() {
    var errors = CORE.validateForm({
      name: document.getElementById("name").value,
      phone: phoneInput.value,
      method: methodSelect.value,
      username: usernameInput.value,
      consent: consentInput.checked
    });

    clearFieldError(document.getElementById("name"));
    clearFieldError(phoneInput);
    clearFieldError(usernameInput);

    var messages = [];
    for (var i = 0; i < errors.length; i++) {
      messages.push(errors[i].message);
      if (errors[i].field !== "consent") {
        var input = fieldInput(errors[i].field);
        if (input) setFieldError(input);
      }
    }
    return messages;
  }

  function readFormFields() {
    return {
      name: document.getElementById("name").value,
      phone: phoneInput.value,
      method: methodSelect.value,
      username: usernameInput.value,
      consent: consentInput.checked,
      company: document.getElementById("company").value
    };
  }

  function buildPayload() {
    return CORE.buildPayload(readFormFields());
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
          PHONE_PLACEHOLDER +
          ".",
        "success",
        false
      );
    }
    resetForm();
  }

  /* Явная очистка: form.reset() не всегда убирает значение у tel-поля с маской */
  function resetForm() {
    form.reset();
    var state = CORE.emptyFormState();
    var nameInput = document.getElementById("name");
    var companyInput = document.getElementById("company");
    nameInput.value = state.name;
    phoneInput.value = state.phone;
    usernameInput.value = state.username;
    companyInput.value = state.company;
    methodSelect.value = state.method;
    consentInput.checked = state.consent;
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
