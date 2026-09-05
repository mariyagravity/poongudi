// env-config.js
// Dynamic environment configuration loaded from window or server
(function() {
  window.ENV = window.ENV || {};
  // Sets endpoint dynamically relative to current host or window environment
  window.ENV.API_ENDPOINT = window.ENV.API_ENDPOINT || (window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '') + '/save-response.php');
})();
