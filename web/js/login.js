/**
 * ====================================================
 * EWS LAB RISET — LOGIN PAGE JAVASCRIPT
 * File  : web/js/login.js
 * Fungsi: Autentikasi, toggle password, redirect
 * ====================================================
 */

'use strict';

/* --------------------------------------------------
   CONSTANTS
   -------------------------------------------------- */
const VALID_USERNAME = 'admin';
const VALID_PASSWORD = 'ews2026';
const AUTH_KEY       = 'ews_auth';
const DASHBOARD_URL  = 'dashboard.html';

/* --------------------------------------------------
   REDIRECT jika sudah login
   -------------------------------------------------- */
(function checkExistingAuth() {
  if (localStorage.getItem(AUTH_KEY)) {
    window.location.href = DASHBOARD_URL;
  }
})();

/* --------------------------------------------------
   DOM ELEMENTS
   -------------------------------------------------- */
const loginForm     = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorAlert    = document.getElementById('errorAlert');
const toggleBtn     = document.getElementById('togglePassword');
const btnLogin      = document.getElementById('btnLogin');

/* --------------------------------------------------
   TOGGLE SHOW / HIDE PASSWORD
   -------------------------------------------------- */
toggleBtn.addEventListener('click', function () {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  toggleBtn.textContent = isHidden ? '🙈' : '👁️';
});

/* --------------------------------------------------
   FORM SUBMIT — LOGIN HANDLER
   -------------------------------------------------- */
loginForm.addEventListener('submit', function (e) {
  e.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  // Reset error
  hideError();

  // Validasi
  if (!username || !password) {
    showError('Username dan password tidak boleh kosong.');
    return;
  }

  // Cek kredensial
  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    handleLoginSuccess(username);
  } else {
    handleLoginFailed();
  }
});

/* --------------------------------------------------
   SUCCESS: simpan token, redirect ke dashboard
   -------------------------------------------------- */
function handleLoginSuccess(username) {
  // Tombol loading
  btnLogin.disabled = true;
  btnLogin.querySelector('.btn-text').textContent = 'Masuk...';

  // Simpan sesi
  const token = btoa(username + ':' + Date.now());
  localStorage.setItem(AUTH_KEY, token);

  // Redirect setelah 400ms
  setTimeout(function () {
    window.location.href = DASHBOARD_URL;
  }, 400);
}

/* --------------------------------------------------
   FAILED: tampilkan error, shake animasi
   -------------------------------------------------- */
function handleLoginFailed() {
  showError('Username atau password salah. Silakan coba lagi.');
  passwordInput.value = '';
  passwordInput.focus();

  // Shake input
  usernameInput.classList.add('input-shake');
  passwordInput.classList.add('input-shake');

  setTimeout(function () {
    usernameInput.classList.remove('input-shake');
    passwordInput.classList.remove('input-shake');
  }, 500);
}

/* --------------------------------------------------
   HELPERS
   -------------------------------------------------- */
function showError(msg) {
  errorAlert.textContent = '❌ ' + msg;
  errorAlert.classList.add('show');
}

function hideError() {
  errorAlert.classList.remove('show');
}

/* --------------------------------------------------
   Clear error saat user mengetik ulang
   -------------------------------------------------- */
[usernameInput, passwordInput].forEach(function (el) {
  el.addEventListener('input', hideError);
});
