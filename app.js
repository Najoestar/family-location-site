const form = document.querySelector("#locationForm");
const latInput = document.querySelector("#lat");
const lngInput = document.querySelector("#lng");
const mapsLinkInput = document.querySelector("#mapsLink");
const noteInput = document.querySelector("#note");
const statusText = document.querySelector("#status");
const selectedMapLink = document.querySelector("#selectedMapLink");
const languageToggle = document.querySelector("#languageToggle");
const defaultPosition = [24.467213, 39.611160];
const defaultZoom = 13;
const translations = {
  ar: {
    pageTitle: "إرسال موقع المنزل",
    languageButton: "English",
    eyebrow: "تحديد موقع العائلة",
    heroTitle: "أرسل موقع المنزل بخصوصية",
    heroText: "النموذج يرسل نقطة على الخريطة فقط، ولا يطلب الاسم أو رقم الجوال أو البريد الإلكتروني أو أي حساب.",
    privacyNoNames: "بدون أسماء",
    privacyNoPhones: "بدون أرقام جوال",
    privacyNoPersonal: "بدون معلومات شخصية",
    locationTitle: "موقع المنزل",
    locationIntro: "حدد المنزل على الخريطة، أو الصق رابط Google Maps.",
    mapsLabel: "رابط Google Maps",
    mapsPlaceholder: "الصق رابط مشاركة من Google Maps",
    mapAria: "خريطة تحديد الموقع",
    mapHelp: "اضغط على الخريطة لوضع دبوس المنزل، أو الصق رابط Google Maps يحتوي على الإحداثيات.",
    selectedMapLink: "فتح الموقع المحدد في Google Maps",
    noteLabel: "ملاحظة اختيارية",
    notePlaceholder: "مثلا: مدخل الشقة أو رقم البوابة",
    submitButton: "إرسال الموقع",
    locationSet: "تم تحديد الموقع. يمكنك إرساله الآن.",
    mapLoadError: "تعذر تحميل الخريطة. الصق رابط Google Maps بدلا من ذلك.",
    pasteCoordinatesError: "لم نتمكن من قراءة هذا الرابط. افتحه في Google Maps ثم انسخ الرابط الكامل، أو حدد الموقع على الخريطة.",
    resolvingMapLink: "جاري قراءة رابط Google Maps...",
    googleLocationAdded: "تم إضافة موقع Google Maps. تأكد من الدبوس ثم أرسل.",
    invalidLocation: "يرجى تحديد موقع صحيح على الخريطة.",
    sending: "جاري إرسال الموقع...",
    sendFailed: "تعذر إرسال الموقع.",
    sent: "تم إرسال الموقع. شكرا لك.",
    markerTitle: "موقع المنزل",
  },
  en: {
    pageTitle: "Submit Home Location",
    languageButton: "عربي",
    eyebrow: "Family location",
    heroTitle: "Send the home location privately",
    heroText: "This form sends only one point on the map. It does not ask for a name, mobile number, email, or account.",
    privacyNoNames: "No names",
    privacyNoPhones: "No mobile numbers",
    privacyNoPersonal: "No personal information",
    locationTitle: "Home location",
    locationIntro: "Select the home on the map, or paste a Google Maps link.",
    mapsLabel: "Google Maps link",
    mapsPlaceholder: "Paste a share link from Google Maps",
    mapAria: "Location picker map",
    mapHelp: "Tap the map to place the home pin, or paste a Google Maps link that includes coordinates.",
    selectedMapLink: "Open selected location in Google Maps",
    noteLabel: "Optional note",
    notePlaceholder: "Example: apartment entrance or gate number",
    submitButton: "Send location",
    locationSet: "Location selected. You can send it now.",
    mapLoadError: "Could not load the map. Paste a Google Maps link instead.",
    pasteCoordinatesError: "Could not read this link. Open it in Google Maps and copy the full link, or select the location on the map.",
    resolvingMapLink: "Checking Google Maps link...",
    googleLocationAdded: "Google Maps location added. Check the pin, then send.",
    invalidLocation: "Please select a valid location on the map.",
    sending: "Sending location...",
    sendFailed: "Could not send the location.",
    sent: "Location sent. Thank you.",
    markerTitle: "Home location",
  },
};
let map;
let marker;
let currentLanguage = localStorage.getItem("siteLanguage") === "en" ? "en" : "ar";
let currentStatusKey = "";
let currentStatusIsError = false;
let resolveMapLinkTimer;
let resolveMapLinkRequestId = 0;

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

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  const mapElement = document.querySelector("#map");
  if (mapElement) mapElement.setAttribute("aria-label", t("mapAria"));
  if (languageToggle) {
    languageToggle.textContent = t("languageButton");
    languageToggle.setAttribute("aria-label", currentLanguage === "ar" ? "Switch to English" : "التبديل إلى العربية");
  }
  if (marker) {
    marker.options.alt = t("markerTitle");
    marker.options.title = t("markerTitle");
  }
  if (currentStatusKey) setStatusKey(currentStatusKey, currentStatusIsError);
}

function setStatusKey(key, isError = false) {
  currentStatusKey = key;
  currentStatusIsError = isError;
  statusText.textContent = t(key);
  statusText.classList.toggle("error", isError);
}

function setStatus(message, isError = false) {
  currentStatusKey = "";
  currentStatusIsError = isError;
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function googleMapsUrl(lat, lng) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(lat + "," + lng);
}

function updateSelectedMapLink(lat, lng) {
  if (!selectedMapLink) return;
  selectedMapLink.href = googleMapsUrl(lat, lng);
  selectedMapLink.classList.remove("is-hidden");
}

function clearSelectedLocation() {
  latInput.value = "";
  lngInput.value = "";
  if (selectedMapLink) selectedMapLink.classList.add("is-hidden");
}

function setLocation(lat, lng, statusKey = "locationSet") {
  latInput.value = Number(lat).toFixed(6);
  lngInput.value = Number(lng).toFixed(6);

  if (map && marker) {
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], Math.max(map.getZoom(), defaultZoom));
  }

  updateSelectedMapLink(latInput.value, lngInput.value);
  setStatusKey(statusKey);
}

function parseGoogleMapsCoordinates(value) {
  let text = value.trim();
  if (!text) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch (error) {
      break;
    }
  }

  const patterns = [
    { regex: /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/ },
    { regex: /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/, reverse: true },
    { regex: /[?&](?:query|q|ll|center|destination|daddr)=loc:(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /[?&]query=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /[?&]center=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /[?&]destination=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /[?&]daddr=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
    { regex: /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/ },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;

    let lat = Number(match[1]);
    let lng = Number(match[2]);
    if (pattern.reverse) [lat, lng] = [lng, lat];

    if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}


function clearMapLinkResolve() {
  window.clearTimeout(resolveMapLinkTimer);
  resolveMapLinkTimer = undefined;
  resolveMapLinkRequestId += 1;
}

async function resolveGoogleMapsLink(value, requestId) {
  setStatusKey("resolvingMapLink");

  try {
    const response = await fetch("/api/resolve-map-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });

    const result = await response.json();
    if (requestId !== resolveMapLinkRequestId || mapsLinkInput.value.trim() !== value.trim()) return;
    if (!response.ok) throw new Error(result.error || t("pasteCoordinatesError"));

    setLocation(result.lat, result.lng, "googleLocationAdded");
  } catch (error) {
    if (requestId === resolveMapLinkRequestId && mapsLinkInput.value.trim() === value.trim()) {
      setStatusKey("pasteCoordinatesError", true);
    }
  }
}

function scheduleMapLinkResolve(value) {
  window.clearTimeout(resolveMapLinkTimer);
  const requestId = resolveMapLinkRequestId + 1;
  resolveMapLinkRequestId = requestId;
  setStatusKey("resolvingMapLink");
  resolveMapLinkTimer = window.setTimeout(() => resolveGoogleMapsLink(value, requestId), 650);
}

function initMap() {
  if (!window.L) {
    setStatusKey("mapLoadError", true);
    return;
  }

  map = L.map("map", {
    zoomControl: false,
    attributionControl: true,
  }).setView(defaultPosition, defaultZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  marker = L.marker(defaultPosition, { alt: t("markerTitle"), draggable: true, title: t("markerTitle") }).addTo(map);
  marker.on("dragend", () => {
    const position = marker.getLatLng();
    setLocation(position.lat, position.lng);
  });

  map.on("click", (event) => {
    setLocation(event.latlng.lat, event.latlng.lng);
  });
}

mapsLinkInput.addEventListener("input", () => {
  const value = mapsLinkInput.value.trim();
  const coordinates = parseGoogleMapsCoordinates(value);

  if (coordinates) {
    clearMapLinkResolve();
    setLocation(coordinates.lat, coordinates.lng, "googleLocationAdded");
    return;
  }

  if (value) {
    clearSelectedLocation();
    scheduleMapLinkResolve(value);
  } else {
    clearMapLinkResolve();
    clearSelectedLocation();
  }
});

languageToggle.addEventListener("click", () => {
  applyLanguage(currentLanguage === "ar" ? "en" : "ar");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const lat = Number(latInput.value);
  const lng = Number(lngInput.value);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    setStatusKey("invalidLocation", true);
    return;
  }

  setStatusKey("sending");

  try {
    const response = await fetch("/api/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, note: noteInput.value }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || t("sendFailed"));

    form.reset();
    mapsLinkInput.value = "";
    if (selectedMapLink) selectedMapLink.classList.add("is-hidden");
    if (map && marker) {
      marker.setLatLng(defaultPosition);
      map.setView(defaultPosition, defaultZoom);
    }
    setStatusKey("sent");
  } catch (error) {
    setStatus(error.message, true);
  }
});

applyLanguage(currentLanguage);
initMap();
