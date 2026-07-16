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
      errorMsg.textContent = "Please fill in both password fields.";
      errorMsg.style.display = 'block';
      return;
    }
    
    if (p1 !== p2) {
      errorMsg.textContent = "Passwords do not match.";
      errorMsg.style.display = 'block';
      return;
    }
    

    try {
      errorMsg.style.display = 'none';
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      
      await update(ref(db, `users/${username}`), { password: p1 });
      
      alert("Password updated successfully!");
      newPwd.value = '';
      confirmPwd.value = '';
      saveBtn.disabled = false;
      saveBtn.textContent = "Update Password";
    } catch (e) {
      console.error("Failed to update password", e);
      errorMsg.textContent = "Error updating password. Please try again.";
      errorMsg.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = "Update Password";
    }
  });
}
