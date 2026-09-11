(function () {
  "use strict";

  var tinyslider = function () {
    var el = document.querySelectorAll(".testimonial-slider");

    if (el.length > 0) {
      var slider = tns({
        container: ".testimonial-slider",
        items: 1,
        axis: "horizontal",
        controlsContainer: "#testimonial-nav",
        swipeAngle: false,
        speed: 700,
        nav: true,
        controls: true,
        autoplay: true,
        autoplayHoverPause: true,
        autoplayTimeout: 3500,
        autoplayButtonOutput: false,
      });
    }
  };
  tinyslider();

  var sitePlusMinus = function () {
    var value,
      quantity = document.getElementsByClassName("quantity-container");

    function createBindings(quantityContainer) {
      var quantityAmount =
        quantityContainer.getElementsByClassName("quantity-amount")[0];
      var increase = quantityContainer.getElementsByClassName("increase")[0];
      var decrease = quantityContainer.getElementsByClassName("decrease")[0];
      increase.addEventListener("click", function (e) {
        increaseValue(e, quantityAmount);
      });
      decrease.addEventListener("click", function (e) {
        decreaseValue(e, quantityAmount);
      });
    }

    function init() {
      for (var i = 0; i < quantity.length; i++) {
        createBindings(quantity[i]);
      }
    }

    function increaseValue(event, quantityAmount) {
      value = parseInt(quantityAmount.value, 10);

      console.log(quantityAmount, quantityAmount.value);

      value = isNaN(value) ? 0 : value;
      value++;
      quantityAmount.value = value;
    }

    function decreaseValue(event, quantityAmount) {
      value = parseInt(quantityAmount.value, 10);

      value = isNaN(value) ? 0 : value;
      if (value > 0) value--;

      quantityAmount.value = value;
    }

    init();
  };
  sitePlusMinus();

  var navbarScroll = function () {
    var navbar = document.querySelector(".custom-navbar");

    if (!navbar) {
      return;
    }

    var scrollPosition = window.scrollY;

    if (scrollPosition > 50) {
      navbar.classList.add("navbar-scrolled");
    } else {
      navbar.classList.remove("navbar-scrolled");
    }
  };

  window.addEventListener("scroll", navbarScroll);

  navbarScroll();

  /* =========================================================
   BRICKSTARE AUTHENTICATION
   ========================================================= */

  /* =========================================================
   FORM ELEMENTS
   ========================================================= */

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const forgotForm = document.getElementById("forgotForm");

  const forms = {
    login: loginForm,
    register: registerForm,
    forgot: forgotForm,
  };

  /* =========================================================
   SWITCH BETWEEN LOGIN / REGISTER / FORGOT
   ========================================================= */

  function showAuthForm(formName) {
    Object.values(forms).forEach((form) => {
      if (form) {
        form.classList.remove("active");
      }
    });

    const selectedForm = forms[formName];

    if (selectedForm) {
      selectedForm.classList.add("active");
    }

    clearMessages();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  /* =========================================================
   SWITCH BUTTONS
   ========================================================= */

  document.querySelectorAll("[data-switch]").forEach((button) => {
    button.addEventListener("click", function () {
      const destination = this.getAttribute("data-switch");

      showAuthForm(destination);
    });
  });

  /* =========================================================
   PASSWORD SHOW / HIDE
   ========================================================= */

  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", function () {
      const passwordId = this.getAttribute("data-password");

      const passwordInput = document.getElementById(passwordId);

      const icon = this.querySelector("i");

      if (!passwordInput) {
        return;
      }

      if (passwordInput.type === "password") {
        passwordInput.type = "text";

        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");

        this.setAttribute("aria-label", "Hide password");
      } else {
        passwordInput.type = "password";

        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");

        this.setAttribute("aria-label", "Show password");
      }
    });
  });

  /* =========================================================
   MESSAGE FUNCTIONS
   ========================================================= */

  function showMessage(elementId, message, type = "error") {
    const element = document.getElementById(elementId);

    if (!element) {
      return;
    }

    element.textContent = message;

    element.className = `auth-message show ${type}`;
  }

  function clearMessages() {
    document.querySelectorAll(".auth-message").forEach((element) => {
      element.textContent = "";

      element.className = "auth-message";
    });
  }

  /* =========================================================
   EMAIL VALIDATION
   ========================================================= */

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function portalFor(user) {
    if (user.role === "rider") return "/rider/rider.html";
    if (user.role === "dispatcher") return "/dispatcher/index.html";
    if (user.role === "retailer") return "/retailer/dashboard.html";
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") ? next : "/shop.html";
  }

  function rememberUser(user, token) {
    localStorage.setItem("brickstare_email", user.email);
    localStorage.setItem("brickstare_name", user.name || "");
    localStorage.setItem("brickstare_role", user.role || "customer");
    if (user.role === "rider") localStorage.setItem("riderEmail", user.email);
    if (user.role === "dispatcher") {
      localStorage.setItem("dispatcherToken", token || "session");
      localStorage.setItem("dispatcherUser", JSON.stringify(user));
    }
    if (user.role === "retailer") {
      localStorage.setItem("brickstareRetailerUser", JSON.stringify(user));
    }
  }

  async function redirectExistingSession() {
    if (!loginForm || !registerForm) return;
    try {
      const response = await fetch("/api/me", { credentials: "same-origin" });
      if (!response.ok) return;
      const data = await response.json();
      if (data.user) {
        rememberUser(data.user);
        window.location.replace(portalFor(data.user));
      }
    } catch (_) {}
  }

  redirectExistingSession();

  /* =========================================================
   LOGIN
   ========================================================= */

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      if (!email) { showMessage("loginMessage", "Please enter your email address."); return; }
      if (!isValidEmail(email)) { showMessage("loginMessage", "Please enter a valid email address."); return; }
      if (!password) { showMessage("loginMessage", "Please enter your password."); return; }
      if (password.length < 6) { showMessage("loginMessage", "Your password must contain at least 6 characters."); return; }

      const submitButton = loginForm.querySelector(".auth-submit");
      submitButton.disabled = true;
      submitButton.innerHTML = "<span>Signing in...</span>";

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.message || "Login failed.");

        const user = data.user;
        rememberUser(user, data.token);
        showMessage("loginMessage", "Login successful. Redirecting...", "success");
        setTimeout(() => {
          window.location.href = portalFor(user);
        }, 350);
      } catch (error) {
        showMessage("loginMessage", error.message || "Login failed. Please try again.");
        submitButton.disabled = false;
        submitButton.innerHTML = "<span>Sign In</span>";
      }
    });
  }

  /* =========================================================
   REGISTRATION
   ========================================================= */

  if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const name = document.getElementById("registerName").value.trim();
      const email = document.getElementById("registerEmail").value.trim();
      const phone = document.getElementById("registerPhone").value.trim();
      const accountType = document.getElementById("accountType").value;
      const password = document.getElementById("registerPassword").value;
      const confirmPassword = document.getElementById("confirmPassword").value;
      const terms = document.getElementById("terms").checked;

      if (name.length < 2) { showMessage("registerMessage", "Please enter your full name."); return; }
      if (!isValidEmail(email)) { showMessage("registerMessage", "Please enter a valid email address."); return; }
      if (!phone) { showMessage("registerMessage", "Please enter your phone number."); return; }
      if (!accountType) { showMessage("registerMessage", "Please select an account type."); return; }
      if (password.length < 8) { showMessage("registerMessage", "Password must contain at least 8 characters."); return; }
      if (password !== confirmPassword) { showMessage("registerMessage", "Passwords do not match."); return; }
      if (!terms) { showMessage("registerMessage", "Please accept the Terms & Conditions."); return; }

      const submitButton = registerForm.querySelector(".auth-submit");
      submitButton.disabled = true;
      submitButton.innerHTML = "<span>Creating account...</span>";

      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ name, email, phone, password, role: accountType })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Registration failed.");

        rememberUser(data.user, data.token);
        showMessage("registerMessage", "Account created. You are signed in.", "success");
        setTimeout(() => {
          window.location.href = portalFor(data.user);
        }, 350);
      } catch (error) {
        showMessage("registerMessage", error.message || "Registration failed. Please try again.");
        submitButton.disabled = false;
        submitButton.innerHTML = "<span>Create Account</span>";
      }
    });
  }

  /* =========================================================
   FORGOT PASSWORD
   ========================================================= */

  if (forgotForm) {
    forgotForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const email = document.getElementById("forgotEmail").value.trim();

      if (!email) {
        showMessage("forgotMessage", "Please enter your email address.");

        return;
      }

      if (!isValidEmail(email)) {
        showMessage("forgotMessage", "Please enter a valid email address.");

        return;
      }

      const submitButton = forgotForm.querySelector(".auth-submit");

      submitButton.disabled = true;

      submitButton.innerHTML = "<span>Sending...</span>";

      /*
       * DEMO ONLY
       *
       * A real password reset must be handled
       * by your backend and email service.
       */

      setTimeout(() => {
        showMessage(
          "forgotMessage",
          "If an account exists with this email, a password reset link will be sent.",
          "success",
        );

        submitButton.disabled = false;

        submitButton.innerHTML = "<span>Send Reset Link</span>";
      }, 900);
    });
  }

  /* =========================================================
   REMEMBER ME
   ========================================================= */

  const rememberMe = document.getElementById("rememberMe");

  const loginEmail = document.getElementById("loginEmail");

  if (rememberMe && loginEmail) {
    const savedEmail = localStorage.getItem("brickstare_remember_email");

    if (savedEmail) {
      loginEmail.value = savedEmail;

      rememberMe.checked = true;
    }

    rememberMe.addEventListener("change", function () {
      if (this.checked) {
        localStorage.setItem(
          "brickstare_remember_email",
          loginEmail.value.trim(),
        );
      } else {
        localStorage.removeItem("brickstare_remember_email");
      }
    });

    loginEmail.addEventListener("input", function () {
      if (rememberMe.checked) {
        localStorage.setItem("brickstare_remember_email", this.value.trim());
      }
    });
  }

  /* =========================================================
   CURRENT YEAR
   ========================================================= */

  const authYear = document.getElementById("authYear");

  if (authYear) {
    authYear.textContent = new Date().getFullYear();
  }
})();
