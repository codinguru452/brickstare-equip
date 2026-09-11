const API = "/api";
let riderEmail = "";
let riderId = "";
let riderData = { name: "Rider", deliveries: [] };
let selectedDelivery = null;
let currentFilter = "all";
let cameraStream = null;
let qrScanTimer = null;

const statusClass = (status) => status.toLowerCase().replace(/\s+/g, "-");
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function showNotification(message) {
  const existing = document.querySelector(".rider-notification");
  existing?.remove();
  const n = document.createElement("div");
  n.className = "rider-notification show";
  n.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${esc(message)}</span>`;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2600);
}

async function loadDeliveries() {
  const response = await fetch(`${API}/deliveries`, { credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Unable to load deliveries");
  riderData.deliveries = data.deliveries || [];
  renderRider();
}

function filteredDeliveries() {
  if (currentFilter === "all") return riderData.deliveries;
  return riderData.deliveries.filter((d) => statusClass(d.status) === currentFilter);
}

function renderHistory() {
  const root = document.getElementById("historyList");
  if (!root) return;
  const completed = riderData.deliveries.filter((d) => d.status === "Delivered").sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  root.innerHTML = completed.length ? completed.map((d) => `
    <div class="history-row">
      <div class="history-icon delivered-history"><i class="fa-solid fa-check"></i></div>
      <div class="history-info"><strong>${esc(d.id)} delivered</strong><span>${esc(d.destination)} · ${esc(d.customerName)}</span></div>
      <time>${new Date(d.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
    </div>`).join("") : "<p>No completed deliveries yet.</p>";
}

function renderRider() {
  document.getElementById("navRiderName")?.replaceChildren(document.createTextNode(riderData.name));
  document.getElementById("pageRiderName")?.replaceChildren(document.createTextNode(riderData.name.split(/\s+/)[0] || riderData.name));
  document.getElementById("assignedCount")?.replaceChildren(document.createTextNode(riderData.deliveries.filter((d) => d.status === "Assigned").length));
  document.getElementById("pickedUpCount")?.replaceChildren(document.createTextNode(riderData.deliveries.filter((d) => d.status === "Picked Up").length));
  document.getElementById("deliveredCount")?.replaceChildren(document.createTextNode(riderData.deliveries.filter((d) => d.status === "Delivered").length));
  document.getElementById("totalCount")?.replaceChildren(document.createTextNode(riderData.deliveries.length));

  const list = document.getElementById("deliveryList");
  const visible = filteredDeliveries();
  if (list) {
    list.innerHTML = visible.length ? visible.map((d) => `
      <article class="delivery-card" data-status="${statusClass(d.status)}" data-id="${esc(d.id)}">
        <div class="delivery-card-header"><div><span class="delivery-id">${esc(d.id)}</span><span class="delivery-status status-${statusClass(d.status)}">${esc(d.status)}</span></div><span class="delivery-time">${new Date(d.updatedAt || d.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div>
        <div class="delivery-card-body">
          <div class="delivery-customer"><div class="mini-avatar"><i class="fa-solid fa-user"></i></div><div><strong>${esc(d.customerName)}</strong><span>${esc(d.customerPhone)}</span></div></div>
          <div class="delivery-location"><i class="fa-solid fa-location-dot"></i><span>${esc(d.destination)}</span></div>
          <div class="delivery-product"><span>Item</span><strong>${esc(d.itemDescription)}</strong></div>
        </div>
        <div class="delivery-card-footer"><button type="button" class="delivery-action-button" onclick="selectDelivery('${esc(d.id)}')">View / Update</button></div>
      </article>`).join("") : "<p>No deliveries in this view.</p>";
  }

  renderHistory();
  const active = riderData.deliveries.find((d) => d.status === "Picked Up") || riderData.deliveries.find((d) => d.status === "Assigned");
  const card = document.getElementById("activeDeliveryCard");
  let empty = document.getElementById("noActiveDelivery");
  if (active) {
    if (card) card.style.display = "block";
    if (empty) empty.remove();
    updateActive(active);
  } else {
    selectedDelivery = null;
    if (card) card.style.display = "none";
    if (!empty && card) {
      empty = document.createElement("div");
      empty.id = "noActiveDelivery";
      empty.className = "active-delivery-card";
      empty.innerHTML = "<p>No active delivery right now.</p>";
      card.insertAdjacentElement("afterend", empty);
    }
  }
}

function updateProgress(status) {
  const steps = document.querySelectorAll(".delivery-progress .progress-step");
  const lines = document.querySelectorAll(".delivery-progress .progress-line");
  const stage = { "Assigned": 0, "Picked Up": 1, "Delivered": 2 }[status] ?? 0;
  steps.forEach((step, index) => {
    step.classList.toggle("completed", index < stage || status === "Delivered");
    step.classList.toggle("current", index === stage && status !== "Delivered");
  });
  lines.forEach((line, index) => line.classList.toggle("completed", index < stage));
}

function updateActive(d) {
  selectedDelivery = d;
  const card = document.getElementById("activeDeliveryCard");
  if (card) card.style.display = "block";
  const set = (id, value) => document.getElementById(id)?.replaceChildren(document.createTextNode(value));
  set("activeDeliveryId", d.id);
  set("activeCustomer", d.customerName);
  set("activePhone", d.customerPhone);
  set("activeAddress", d.destination);
  set("activeItem", d.itemDescription);
  set("activeRetailer", d.retailerEmail || "Retailer");
  set("activeDeliveryStatus", d.status);
  updateProgress(d.status);

  const button = document.getElementById("updateDeliveryButton");
  if (button) {
    button.textContent = d.status === "Assigned" ? "Mark as Picked Up" : d.status === "Picked Up" ? "Verify Package" : "Completed";
    button.disabled = d.status === "Delivered";
  }
  const inlineVerify = document.getElementById("openVerificationButton");
  if (inlineVerify) inlineVerify.disabled = d.status !== "Picked Up";
}

window.selectDelivery = (id) => {
  const d = riderData.deliveries.find((item) => item.id === id);
  if (d) {
    updateActive(d);
    document.getElementById("activeDeliveryCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

async function updateStatus(status) {
  if (!selectedDelivery) return;
  const response = await fetch(`${API}/deliveries/${selectedDelivery.id}/status`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await response.json();
  if (!response.ok) return showNotification(data.message || "Unable to update status");
  await loadDeliveries();
  const updated = riderData.deliveries.find((d) => d.id === data.delivery.id);
  if (updated) updateActive(updated);
  showNotification(`Delivery ${status.toLowerCase()}.`);
}

function openVerification() {
  if (!selectedDelivery || selectedDelivery.status !== "Picked Up") {
    showNotification("Mark the package as picked up first.");
    return;
  }
  const input = document.getElementById("packageIdInput");
  if (input) input.value = "";
  const status = document.getElementById("verificationStatus");
  if (status) status.textContent = selectedDelivery.packageVerified ? "Package verified ✓" : "Ready to verify.";
  const deliveredButton = document.getElementById("markDeliveredButton");
  if (deliveredButton) deliveredButton.disabled = !selectedDelivery.packageVerified;
  document.getElementById("verificationModal")?.classList.add("open");
}

async function stopQrScanner() {
  if (qrScanTimer) {
    clearInterval(qrScanTimer);
    qrScanTimer = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById("qrVideo");
  if (video) video.srcObject = null;
  const camera = document.getElementById("qrCamera");
  if (camera) camera.hidden = true;
}

async function startQrScanner() {
  if (!selectedDelivery || selectedDelivery.status !== "Picked Up") {
    showNotification("Mark the package as picked up first.");
    return;
  }
  const status = document.getElementById("verificationStatus");
  const camera = document.getElementById("qrCamera");
  const video = document.getElementById("qrVideo");
  if (!navigator.mediaDevices?.getUserMedia) {
    if (status) status.textContent = "Camera access is not available in this browser. Enter the Package ID below.";
    return;
  }
  try {
    if (status) status.textContent = "Allow BrickStare to access your camera...";
    camera.hidden = false;
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = cameraStream;
    await video.play();
    if (status) status.textContent = "Camera ready. Point it at the package QR code.";

    if ("BarcodeDetector" in window) {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      qrScanTimer = setInterval(async () => {
        if (!video.videoWidth || !video.videoHeight || !selectedDelivery) return;
        try {
          const codes = await detector.detect(video);
          const value = codes?.[0]?.rawValue?.trim();
          if (value) {
            await stopQrScanner();
            await verifyPackage("qr", value);
          }
        } catch (_) {}
      }, 500);
    } else if (status) {
      status.textContent = "Camera is on. QR scanning is not supported by this browser; enter the Package ID below.";
    }
  } catch (error) {
    await stopQrScanner();
    if (status) status.textContent = error?.name === "NotAllowedError" ? "Camera access was denied. Enter the Package ID below instead." : "Could not open the camera. Enter the Package ID below.";
  }
}

async function verifyPackage(method = "manual", value = "") {
  if (!selectedDelivery) return;
  const input = String(value || document.getElementById("packageIdInput")?.value || "").trim();
  if (!input) return showNotification("Enter the Package ID or use Scan QR Code.");
  const status = document.getElementById("verificationStatus");
  if (status) status.textContent = "Checking package...";
  await new Promise((resolve) => setTimeout(resolve, 500));
  const response = await fetch(`${API}/deliveries/${selectedDelivery.id}/verify`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: input, method }),
  });
  const data = await response.json();
  if (!response.ok) {
    if (status) status.textContent = data.message || "Package could not be verified";
    return;
  }
  if (status) status.textContent = "Package verified ✓";
  document.getElementById("markDeliveredButton")?.removeAttribute("disabled");
  selectedDelivery = data.delivery;
  await loadDeliveries();
  const updated = riderData.deliveries.find((d) => d.id === data.delivery.id);
  if (updated) selectedDelivery = updated;
}

async function logout() {
  try { await fetch(`${API}/logout`, { method: "POST", credentials: "same-origin" }); } catch (_) {}
  localStorage.removeItem("riderEmail");
  localStorage.removeItem("reflexUser");
  window.location.href = "/auth/auth.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch(`${API}/me`, { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok || data.user?.role !== "rider") {
      window.location.href = "/auth/auth.html";
      return;
    }
    riderEmail = data.user.email;
    const match = riderEmail.match(/(\d{3})/);
    riderId = `RIDER-${match?.[1] || "001"}`;
    riderData.name = data.user.name || "Rider";
    localStorage.setItem("riderEmail", riderEmail);
  } catch (_) {
    window.location.href = "/auth/auth.html";
    return;
  }

  const date = document.getElementById("currentDate");
  if (date) date.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  document.getElementById("updateDeliveryButton")?.addEventListener("click", () => {
    if (selectedDelivery?.status === "Assigned") updateStatus("Picked Up");
    else if (selectedDelivery?.status === "Picked Up") openVerification();
  });
  document.getElementById("openVerificationButton")?.addEventListener("click", openVerification);
  document.getElementById("verifyPackageButton")?.addEventListener("click", () => verifyPackage("manual"));
  document.getElementById("markDeliveredButton")?.addEventListener("click", async () => {
    await stopQrScanner();
    await updateStatus("Delivered");
    document.getElementById("verificationModal")?.classList.remove("open");
  });
  document.getElementById("closeVerification")?.addEventListener("click", async () => { await stopQrScanner(); document.getElementById("verificationModal")?.classList.remove("open"); });
  document.getElementById("scanQrButton")?.addEventListener("click", startQrScanner);
  document.getElementById("desktopLogout")?.addEventListener("click", logout);
  document.getElementById("mobileLogout")?.addEventListener("click", logout);
  document.getElementById("callCustomerButton")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (selectedDelivery?.customerPhone) window.location.href = `tel:${selectedDelivery.customerPhone}`;
  });

  document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter || "all";
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("active", item === button));
    renderRider();
  }));

  loadDeliveries().catch((error) => showNotification(error.message || "Unable to load deliveries."));
  setInterval(() => loadDeliveries().catch(() => {}), 5000);
});
