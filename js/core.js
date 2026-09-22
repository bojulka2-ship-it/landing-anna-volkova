/* Чистая логика лендинга: маска, ник, валидация, payload. Без DOM. */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SITE_CORE = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PHONE_PLACEHOLDER = "+7 (900) 000-00-00";
  var METHODS_WITH_USERNAME = { max: true, vk: true, whatsapp: true, telegram: true };

  function maskPhone(value) {
    var digits = String(value == null ? "" : value).replace(/\D/g, "");
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

  function phoneDigits(value) {
    return String(value == null ? "" : value).replace(/\D/g, "");
  }

  function normalizeUsername(value) {
    return String(value == null ? "" : value).trim().replace(/^@+/, "");
  }

  function needsUsername(method) {
    return !!METHODS_WITH_USERNAME[method];
  }

  function isValidUsername(value) {
    return /^[A-Za-z0-9_]{4,}$/.test(normalizeUsername(value));
  }

  /**
   * fields: { name, phone, method, username, consent }
   * → [{ field, message }] — field: name|phone|username|consent|*
   */
  function validateForm(fields) {
    var errors = [];
    var name = String(fields.name == null ? "" : fields.name).trim();
    if (!name) {
      errors.push({ field: "name", message: "Укажите имя." });
    } else if (name.length > 120) {
      errors.push({
        field: "name",
        message: "Имя слишком длинное (максимум 120 символов)."
      });
    }

    var digits = phoneDigits(fields.phone);
    if (digits.length !== 11) {
      errors.push({
        field: "phone",
        message:
          "Введите телефон полностью: 11 цифр в формате " + PHONE_PLACEHOLDER + "."
      });
    }

    if (needsUsername(fields.method) && !isValidUsername(fields.username)) {
      errors.push({
        field: "username",
        message:
          "Укажите ник в мессенджере: латиница, цифры и «_», минимум 4 символа (например: anna_ivanova)."
      });
    }

    if (!fields.consent) {
      errors.push({
        field: "consent",
        message: "Отметьте согласие на обработку персональных данных."
      });
    }

    return errors;
  }

  /** fields: { name, phone, method, username, consent, company } */
  function buildPayload(fields) {
    var method = fields.method;
    var payload = {
      name: String(fields.name == null ? "" : fields.name).trim(),
      phone: String(fields.phone == null ? "" : fields.phone),
      method: method,
      consent: fields.consent ? "1" : "0",
      company: String(fields.company == null ? "" : fields.company)
    };
    if (needsUsername(method)) {
      payload.username = normalizeUsername(fields.username);
    }
    return payload;
  }

  /** Состояние полей после успешной отправки (resetForm). */
  function emptyFormState() {
    return {
      name: "",
      phone: "",
      username: "",
      company: "",
      method: "call",
      consent: false
    };
  }

  return {
    PHONE_PLACEHOLDER: PHONE_PLACEHOLDER,
    METHODS_WITH_USERNAME: METHODS_WITH_USERNAME,
    maskPhone: maskPhone,
    phoneDigits: phoneDigits,
    normalizeUsername: normalizeUsername,
    needsUsername: needsUsername,
    isValidUsername: isValidUsername,
    validateForm: validateForm,
    buildPayload: buildPayload,
    emptyFormState: emptyFormState
  };
});
