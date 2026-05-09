const locationsEl = document.querySelector("#locations");
const refreshButton = document.querySelector("#refresh");
const showQrButton = document.querySelector("#showQr");
const closeQrButton = document.querySelector("#closeQr");
const qrDialog = document.querySelector("#qrDialog");
const qrCode = document.querySelector("#qrCode");
const qrUrl = document.querySelector("#qrUrl");

function formatDate(value) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function mapUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function renderLocations(locations) {
  if (!locations.length) {
    locationsEl.innerHTML = `<div class="empty">لم يتم استلام أي مواقع حتى الآن.</div>`;
    return;
  }

  locationsEl.innerHTML = locations.map((location, index) => `
    <article class="location-card">
      <header>
        <h3>منزل ${locations.length - index}</h3>
        <time datetime="${location.createdAt}">${formatDate(location.createdAt)}</time>
      </header>
      <p class="coords" dir="ltr">${location.lat}, ${location.lng}</p>
      ${location.note ? `<p class="quiet">${escapeHtml(location.note)}</p>` : ""}
      <a class="map-link" href="${mapUrl(location.lat, location.lng)}" target="_blank" rel="noreferrer">فتح في Google Maps</a>
    </article>
  `).join("");
}

async function loadLocations() {
  locationsEl.innerHTML = `<div class="empty">جاري تحميل المواقع...</div>`;

  try {
    const response = await fetch("/api/locations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "تعذر تحميل المواقع.");
    renderLocations(data.locations);
  } catch (error) {
    locationsEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function drawQr(text) {
  qrCode.innerHTML = "";

  if (!window.QRCode) {
    throw new Error("تعذر تحميل مولد رمز QR.");
  }

  new window.QRCode(qrCode, {
    text,
    width: 260,
    height: 260,
    colorDark: "#111827",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.H,
  });
}

refreshButton.addEventListener("click", loadLocations);

showQrButton.addEventListener("click", async () => {
  let submitUrl = `${window.location.origin}/`;

  try {
    const response = await fetch("/api/share-url", { cache: "no-store" });
    const data = await response.json();
    if (data.url) submitUrl = data.url;
  } catch (error) {
    submitUrl = `${window.location.origin}/`;
  }

  qrUrl.textContent = submitUrl;

  try {
    drawQr(submitUrl);
    qrDialog.showModal();
  } catch (error) {
    qrUrl.textContent = error.message;
    qrDialog.showModal();
  }
});

closeQrButton.addEventListener("click", () => qrDialog.close());
loadLocations();
