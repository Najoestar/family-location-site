const locationsEl = document.querySelector("#locations");
const refreshButton = document.querySelector("#refresh");
const showQrButton = document.querySelector("#showQr");
const closeQrButton = document.querySelector("#closeQr");
const qrDialog = document.querySelector("#qrDialog");
const qrCode = document.querySelector("#qrCode");
const qrUrl = document.querySelector("#qrUrl");
const languageToggle = document.querySelector("#languageToggle");
const translations = {
  ar: {
    pageTitle: "لوحة المواقع",
    languageButton: "English",
    eyebrow: "لوحة التحكم",
    heroTitle: "مواقع المنازل المستلمة",
    heroText: "تظهر هنا نقاط الخريطة فقط بدون أسماء أو أرقام جوال أو بريد إلكتروني أو حسابات.",
    qrButton: "رمز QR",
    requestsTitle: "الطلبات",
    refreshButton: "تحديث",
    scanTitle: "امسح الرمز للإرسال",
    closeButton: "إغلاق",
    noLocations: "لم يتم استلام أي مواقع حتى الآن.",
    loading: "جاري تحميل المواقع...",
    loadFailed: "تعذر تحميل المواقع.",
    homeLabel: "منزل",
    openMaps: "فتح في Google Maps",
    qrLoadFailed: "تعذر تحميل مولد رمز QR.",
  },
  en: {
    pageTitle: "Locations Dashboard",
    languageButton: "عربي",
    eyebrow: "Admin panel",
    heroTitle: "Received home locations",
    heroText: "Only map points appear here, without names, mobile numbers, emails, or accounts.",
    qrButton: "QR code",
    requestsTitle: "Requests",
    refreshButton: "Refresh",
    scanTitle: "Scan to submit",
    closeButton: "Close",
    noLocations: "No locations have been received yet.",
    loading: "Loading locations...",
    loadFailed: "Could not load locations.",
    homeLabel: "Home",
    openMaps: "Open in Google Maps",
    qrLoadFailed: "Could not load the QR code generator.",
  },
};
let currentLanguage = localStorage.getItem("siteLanguage") === "en" ? "en" : "ar";
let currentLocations = [];

function t(key) {
  return translations[currentLanguage][key] || translations.ar[key] || key;
}

function applyLanguage(language) {
  currentLanguage = language === "en" ? "en" : "ar";
  localStorage.setItem("siteLanguage", currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
  document.title = t("pageTitle");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  if (languageToggle) {
    languageToggle.textContent = t("languageButton");
    languageToggle.setAttribute("aria-label", currentLanguage === "ar" ? "Switch to English" : "التبديل إلى العربية");
  }

  renderLocations(currentLocations);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(currentLanguage === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function mapUrl(lat, lng) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(lat + "," + lng);
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
    locationsEl.innerHTML = '<div class="empty">' + t("noLocations") + '</div>';
    return;
  }

  locationsEl.innerHTML = locations.map((location, index) => {
    const url = mapUrl(location.lat, location.lng);
    return '<article class="location-card">'
      + '<header>'
      + '<h3>' + t("homeLabel") + ' ' + (locations.length - index) + '</h3>'
      + '<time datetime="' + escapeHtml(location.createdAt) + '">' + formatDate(location.createdAt) + '</time>'
      + '</header>'
      + '<p class="coords" dir="ltr">' + escapeHtml(location.lat) + ', ' + escapeHtml(location.lng) + '</p>'
      + (location.note ? '<p class="quiet">' + escapeHtml(location.note) + '</p>' : '')
      + '<div class="map-actions">'
      + '<a class="map-link" href="' + url + '" target="_blank" rel="noreferrer">' + t("openMaps") + '</a>'
      + '</div>'
      + '</article>';
  }).join("");
}

async function loadLocations() {
  locationsEl.innerHTML = '<div class="empty">' + t("loading") + '</div>';

  try {
    const response = await fetch("/api/locations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("loadFailed"));
    currentLocations = data.locations;
    renderLocations(currentLocations);
  } catch (error) {
    locationsEl.innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
  }
}

function drawQr(text) {
  qrCode.innerHTML = "";

  if (!window.QRCode) {
    throw new Error(t("qrLoadFailed"));
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


languageToggle.addEventListener("click", () => {
  applyLanguage(currentLanguage === "ar" ? "en" : "ar");
});

refreshButton.addEventListener("click", loadLocations);

showQrButton.addEventListener("click", async () => {
  let submitUrl = window.location.origin + "/";

  try {
    const response = await fetch("/api/share-url", { cache: "no-store" });
    const data = await response.json();
    if (data.url) submitUrl = data.url;
  } catch (error) {
    submitUrl = window.location.origin + "/";
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
applyLanguage(currentLanguage);
loadLocations();
