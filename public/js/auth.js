// Global access control for Apps
(async function() {
  const t = (key, fb) => window.i18n && window.i18n.t(key) !== key ? window.i18n.t(key) : fb;
  const username = localStorage.getItem("roots-user");
  
  if (!username) {
    window.location.href = "/";
    return;
  }

  // Determine current app ID
  const path = window.location.pathname;
  let appId = "";
  if (path.includes("roots_cod_dashboard")) appId = "roots_cod_dashboard";
  else if (path.includes("pickup_tracker")) appId = "pickup_tracker";
  else if (path.includes("cases_tracker")) appId = "cases_tracker";
  else if (path.includes("admin")) appId = "admin";

  if (!appId) return; // Not an access-controlled app page

  // Master Admin Bypass
  if (username === "Roots" && localStorage.getItem("roots-isAdmin") === "true") {
    return;
  }

  try {
    const res = await fetch(`https://roots-weekly-default-rtdb.europe-west1.firebasedatabase.app/users/${username}.json`);
    const data = await res.json();

    if (appId === "admin") {
      if (!data || !data.isAdmin) {
        alert(t("auth_err_admin", "You do not have permission to access the admin portal."));
        window.location.href = "/";
      }
    } else if (!data || !data.apps || !data.apps[appId]) {
      // User doesn't exist or doesn't have permission
      alert(t("auth_err_app", "You do not have permission to access this app."));
      window.location.href = "/";
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    window.location.href = "/";
  }
})();
