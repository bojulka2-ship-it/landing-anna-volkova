"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../js/core.js");

test("maskPhone: пустой ввод → +7", () => {
  assert.equal(core.maskPhone(""), "+7");
});

test("maskPhone: 8 в начале → 7", () => {
  assert.equal(core.maskPhone("89991234567"), "+7 (999) 123-45-67");
});

test("maskPhone: полный номер с мусором → формат +7 (XXX) XXX-XX-XX", () => {
  assert.equal(core.maskPhone("+7 (999) 123-45-67"), "+7 (999) 123-45-67");
  assert.equal(core.maskPhone("9991234567"), "+7 (999) 123-45-67");
});

test("maskPhone: не более 11 цифр", () => {
  assert.equal(core.maskPhone("9991234567890123"), "+7 (999) 123-45-67");
});

test("maskPhone: частичный ввод", () => {
  assert.equal(core.maskPhone("9"), "+7 (9");
  assert.equal(core.maskPhone("99"), "+7 (99");
  assert.equal(core.maskPhone("9991"), "+7 (999) 1");
});

test("normalizeUsername: ведущие @ срезаются", () => {
  assert.equal(core.normalizeUsername("@maria_ivanova"), "maria_ivanova");
  assert.equal(core.normalizeUsername("@@user"), "user");
  assert.equal(core.normalizeUsername("  user  "), "user");
});

test("needsUsername: только мессенджеры требуют ник", () => {
  assert.equal(core.needsUsername("telegram"), true);
  assert.equal(core.needsUsername("vk"), true);
  assert.equal(core.needsUsername("whatsapp"), true);
  assert.equal(core.needsUsername("max"), true);
  assert.equal(core.needsUsername("call"), false);
  assert.equal(core.needsUsername(""), false);
});

test("isValidUsername: латиница, цифры, _, минимум 4", () => {
  assert.equal(core.isValidUsername("anna_ivanova"), true);
  assert.equal(core.isValidUsername("@anna"), true);
  assert.equal(core.isValidUsername("ab"), false);
  assert.equal(core.isValidUsername("абвгд"), false);
  assert.equal(core.isValidUsername(""), false);
});

function validFields() {
  return {
    name: "Мария",
    phone: "+7 (999) 123-45-67",
    method: "telegram",
    username: "maria_ivanova",
    consent: true,
    company: ""
  };
}

test("validateForm: валидные данные → без ошибок", () => {
  assert.deepEqual(core.validateForm(validFields()), []);
});

test("validateForm: пустое имя, короткий телефон, без согласия", () => {
  const errors = core.validateForm({
    name: "  ",
    phone: "123",
    method: "call",
    username: "",
    consent: false
  });
  const fields = errors.map((e) => e.field);
  assert.deepEqual(fields, ["name", "phone", "consent"]);
  assert.ok(errors[0].message.includes("имя"));
  assert.ok(errors[1].message.includes("11 цифр"));
  assert.ok(errors[2].message.includes("согласие"));
});

test("validateForm: имя длиннее 120 символов", () => {
  const errors = core.validateForm({
    ...validFields(),
    name: "а".repeat(121)
  });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, "name");
});

test("validateForm: ник обязателен для telegram", () => {
  const errors = core.validateForm({ ...validFields(), username: "ab" });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, "username");
});

test("validateForm: для «перезвонить» ник не нужен", () => {
  assert.deepEqual(
    core.validateForm({ ...validFields(), method: "call", username: "" }),
    []
  );
});

test("buildPayload: ник только для мессенджеров, @ нормализуется", () => {
  const p = core.buildPayload(validFields());
  assert.equal(p.username, "maria_ivanova");
  assert.equal(p.consent, "1");

  const call = core.buildPayload({
    ...validFields(),
    method: "call",
    username: ""
  });
  assert.equal("username" in call, false);
  assert.equal(call.name, "Мария");
});

test("emptyFormState: resetForm возвращает форму в исходное состояние", () => {
  const s = core.emptyFormState();
  assert.equal(s.name, "");
  assert.equal(s.phone, "");
  assert.equal(s.username, "");
  assert.equal(s.company, "");
  assert.equal(s.method, "call");
  assert.equal(s.consent, false);
  assert.equal(core.needsUsername(s.method), false);
});
