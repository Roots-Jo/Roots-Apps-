import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  authDomain: "roots-weekly.firebaseapp.com",
  databaseURL: "https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "roots-weekly.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const username = localStorage.getItem("roots-user");

const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;

// Toggle visibility functions
const toggleNewPwd = document.getElementById('toggle-new-pwd');
const newPwd = document.getElementById('new-password');
if (toggleNewPwd && newPwd) {
  toggleNewPwd.addEventListener('click', () => {
    newPwd.type = newPwd.type === 'password' ? 'text' : 'password';
  });
}

const toggleConfirmPwd = document.getElementById('toggle-confirm-pwd');
const confirmPwd = document.getElementById('confirm-password');
if (toggleConfirmPwd && confirmPwd) {
  toggleConfirmPwd.addEventListener('click', () => {
    confirmPwd.type = confirmPwd.type === 'password' ? 'text' : 'password';
  });
}

// Save password
const saveBtn = document.getElementById('save-password-btn');
const errorMsg = document.getElementById('pwd-error');

if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    const p1 = newPwd.value;
    const p2 = confirmPwd.value;

    if (!p1 || !p2) {
      errorMsg.textContent = t("pwd_err_both", "Please fill in both password fields.");
      errorMsg.style.display = 'block';
      return;
    }

    if (p1 !== p2) {
      errorMsg.textContent = t("pwd_err_match", "Passwords do not match.");
      errorMsg.style.display = 'block';
      return;
    }


    try {
      errorMsg.style.display = 'none';
      saveBtn.disabled = true;
      saveBtn.textContent = t("pwd_toast_saving", "Saving...");

      await update(ref(db, `users/${username}`), { password: p1 });

      alert(t("pwd_ok_pass", "Password updated successfully!"));
      newPwd.value = '';
      confirmPwd.value = '';
      saveBtn.disabled = false;
      saveBtn.textContent = t("pwd_btn_update", "Update Password");
    } catch (e) {
      console.error("Failed to update password", e);
      errorMsg.textContent = t("pwd_err_upd", "Error updating password. Please try again.");
      errorMsg.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = t("pwd_btn_update", "Update Password");
    }
  });
}
