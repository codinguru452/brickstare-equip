(function () {
  "use strict";
  const CART_KEY = "brickstare_cart";
  const API = "/api";

  const money = (value) => `KSh ${Number(value || 0).toLocaleString()}`;
  const parseMoney = (text) => Number(String(text || "").replace(/[^\d.]/g, "")) || 0;
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function readCart() {
    try {
      const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(cart) ? cart : [];
    } catch (_) { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }
  function updateCartBadge() {
    const count = readCart().reduce((n, item) => n + Number(item.quantity || 0), 0);
    document.querySelectorAll('img[src$="cart.svg"]').forEach((img) => {
      const link = img.closest("a");
      if (!link) return;
      link.href = "/cart.html";
      link.style.position = "relative";
      let badge = link.querySelector(".brickstare-cart-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "brickstare-cart-badge";
        link.appendChild(badge);
      }
      badge.textContent = count;
      badge.hidden = count === 0;
    });
  }
  async function sessionUser() {
    try {
      const r = await fetch(`${API}/me`, { credentials: "same-origin" });
      if (!r.ok) return null;
      return (await r.json()).user || null;
    } catch (_) { return null; }
  }
  function portal(user) {
    if (!user) return "/auth/auth.html";
    if (user.role === "retailer") return "/retailer/dashboard.html";
    if (user.role === "dispatcher") return "/dispatcher/index.html";
    if (user.role === "rider") return "/rider/rider.html";
    return "/shop.html";
  }
  async function setupUserNav() {
    const user = await sessionUser();
    document.querySelectorAll('img[src$="user.svg"]').forEach((img) => {
      const link = img.closest("a");
      if (!link) return;
      link.href = portal(user);
      link.title = user ? `Signed in as ${user.name}` : "Sign in";
    });
    if (user?.role === "customer") {
      const nav = document.querySelector(".custom-navbar-cta");
      if (nav && !document.getElementById("customerLogoutNav")) {
        const item = document.createElement("li");
        item.id = "customerLogoutNav";
        item.className = "brickstare-customer-nav";
        item.innerHTML = `<span>${esc(user.name)}</span><button type="button" class="brickstare-logout-button">Log out</button>`;
        nav.prepend(item);
        item.querySelector("button").onclick = async () => {
          try { await fetch(`${API}/logout`, { method: "POST", credentials: "same-origin" }); } catch (_) {}
          ["brickstare_email","brickstare_name","brickstare_role","riderEmail","dispatcherToken","dispatcherUser","brickstareRetailerUser"].forEach(k => localStorage.removeItem(k));
          location.href = "/index.html";
        };
      }
    }
    return user;
  }
  function idFor(name) {
    return "SHOP-" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function initShop() {
    document.querySelectorAll(".product-item").forEach((card) => {
      const name = card.querySelector(".product-title")?.textContent.trim() || "Product";
      const price = parseMoney(card.querySelector(".product-price")?.textContent);
      const image = card.querySelector(".product-thumbnail")?.getAttribute("src") || "";
      const hint = document.createElement("span");
      hint.className = "brickstare-add-hint";
      hint.textContent = "Add to cart";
      card.appendChild(hint);
      const status = document.createElement("div");
      status.className = "brickstare-item-added";
      card.insertAdjacentElement("afterend", status);
      card.addEventListener("click", (e) => {
        e.preventDefault();
        const cart = readCart();
        const id = idFor(name);
        const found = cart.find(x => x.productId === id);
        if (found) found.quantity += 1;
        else cart.push({ productId:id, productName:name, price, quantity:1, image });
        saveCart(cart);
        const qty = cart.find(x => x.productId === id).quantity;
        status.textContent = `✓ ${name} added to cart (${qty})`;
        status.classList.add("show");
        setTimeout(() => status.classList.remove("show"), 2200);
      });
    });
  }
  function renderCart() {
    const tbody = document.querySelector(".site-blocks-table tbody");
    if (!tbody) return;
    const cart = readCart();
    tbody.innerHTML = cart.length ? cart.map((item, i) => `
      <tr data-index="${i}">
        <td class="product-thumbnail"><img src="${esc(item.image)}" alt="${esc(item.productName)}" class="img-fluid"></td>
        <td class="product-name"><h2 class="h5 text-black">${esc(item.productName)}</h2></td>
        <td>${money(item.price)}</td>
        <td><div class="input-group d-flex align-items-center quantity-container" style="max-width:120px">
          <button class="btn btn-outline-black cart-qty" type="button" data-delta="-1">−</button>
          <input class="form-control text-center quantity-amount" value="${Number(item.quantity)}" readonly>
          <button class="btn btn-outline-black cart-qty" type="button" data-delta="1">+</button>
        </div></td>
        <td>${money(Number(item.price)*Number(item.quantity))}</td>
        <td><button type="button" class="btn btn-black btn-sm cart-remove">X</button></td>
      </tr>`).join("") : `<tr><td colspan="6" class="text-center py-5">Your cart is empty. <a href="/shop.html">Continue shopping</a>.</td></tr>`;

    tbody.querySelectorAll(".cart-qty").forEach(btn => btn.onclick = () => {
      const i = Number(btn.closest("tr").dataset.index);
      const cart = readCart();
      cart[i].quantity = Math.max(1, Number(cart[i].quantity) + Number(btn.dataset.delta));
      saveCart(cart); renderCart();
    });
    tbody.querySelectorAll(".cart-remove").forEach(btn => btn.onclick = () => {
      const i = Number(btn.closest("tr").dataset.index);
      const cart = readCart(); cart.splice(i,1); saveCart(cart); renderCart();
    });
    const total = cart.reduce((sum,x)=>sum+Number(x.price)*Number(x.quantity),0);
    document.querySelectorAll("[data-cart-total]").forEach(el => el.textContent = money(total));
    const checkout = document.getElementById("proceedCheckoutBtn");
    if (checkout) checkout.disabled = cart.length === 0;
  }
  async function initCheckout() {
    const tbody = document.querySelector(".site-block-order-table tbody");
    if (!tbody) return;
    const user = await sessionUser();
    if (!user) {
      location.href = `/auth/auth.html?next=${encodeURIComponent("/checkout.html")}`;
      return;
    }
    if (user.role !== "customer") {
      location.href = portal(user); return;
    }
    const cart = readCart();
    if (!cart.length) { location.href = "/cart.html"; return; }

    const parts = (user.name || "").trim().split(/\s+/);
    const first = parts.shift() || "", last = parts.join(" ");
    const set = (id,v) => { const el=document.getElementById(id); if(el && !el.value) el.value=v||""; };
    set("c_fname", first); set("c_lname", last); set("c_email_address", user.email); set("c_phone", user.phone);

    const loginNotice = document.querySelector('[role="alert"]');
    if (loginNotice) loginNotice.style.display="none";
    const createAccount = document.getElementById("c_create_account")?.closest(".form-group");
    if (createAccount) createAccount.style.display="none";

    const total = cart.reduce((sum,x)=>sum+Number(x.price)*Number(x.quantity),0);
    tbody.innerHTML = cart.map(x => `<tr><td>${esc(x.productName)} <strong class="mx-2">x</strong> ${Number(x.quantity)}</td><td>${money(Number(x.price)*Number(x.quantity))}</td></tr>`).join("") +
      `<tr><td><strong>Order Total</strong></td><td><strong>${money(total)}</strong></td></tr>`;

    const btn = document.getElementById("placeOrderBtn");
    if (!btn) return;
    btn.onclick = async (e) => {
      e.preventDefault();
      const address=document.getElementById("c_address")?.value.trim();
      const phone=document.getElementById("c_phone")?.value.trim();
      if(!address){alert("Please enter your delivery address.");return;}
      if(!phone){alert("Please enter your phone number.");return;}
      btn.disabled=true; btn.textContent="Placing order...";
      try {
        const r=await fetch(`${API}/orders`,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          address,phone,items:cart.map(({productId,productName,quantity,price})=>({productId,productName,quantity,price}))
        })});
        const data=await r.json();
        if(!r.ok) throw new Error(data.message||"Unable to place order.");
        localStorage.removeItem(CART_KEY);
        sessionStorage.setItem("brickstare_last_order",data.order?.id||"");
        location.href="/thankyou.html";
      } catch(err) {
        alert(err.message); btn.disabled=false; btn.textContent="Place Order";
      }
    };
  }
  function wireButtons() {
    document.querySelectorAll("button").forEach(btn => {
      if(btn.textContent.trim().toLowerCase()==="continue shopping"){
        btn.type="button"; btn.onclick=()=>location.href="/shop.html";
      }
    });
  }
  document.addEventListener("DOMContentLoaded",()=>{updateCartBadge();setupUserNav();initShop();renderCart();wireButtons();initCheckout();});
})();