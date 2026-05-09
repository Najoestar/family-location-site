const useLocationButton = document.querySelector("#useLocation");
const form = document.querySelector("#locationForm");
const latInput = document.querySelector("#lat");
const lngInput = document.querySelector("#lng");
const mapsLinkInput = document.querySelector("#mapsLink");
const noteInput = document.querySelector("#note");
const statusText = document.querySelector("#status");
const defaultPosition = [24.713552, 46.675296];
let map;
let marker;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function setLocation(lat, lng, message = "تم تحديد الموقع. يمكنك إرساله الآن.") {
  latInput.value = Number(lat).toFixed(6);
  lngInput.value = Number(lng).toFixed(6);

  if (map && marker) {
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }

  setStatus(message);
}

function parseGoogleMapsCoordinates(value) {
  const text = value.trim();
  if (!text) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]query=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

function initMap() {
  if (!window.L) {
    setStatus("تعذر تحميل الخريطة. الصق رابط Google Maps بدلا من ذلك.", true);
    return;
  }

  map = L.map("map", {
    zoomControl: false,
    attributionControl: true,
  }).setView(defaultPosition, 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  marker = L.marker(defaultPosition, { alt: "موقع المنزل", draggable: true, title: "موقع المنزل" }).addTo(map);
  marker.on("dragend", () => {
    const position = marker.getLatLng();
    setLocation(position.lat, position.lng);
  });

  map.on("click", (event) => {
    setLocation(event.latlng.lat, event.latlng.lng);
  });
}

mapsLinkInput.addEventListener("input", () => {
  const coordinates = parseGoogleMapsCoordinates(mapsLinkInput.value);
  if (!coordinates) {
    if (mapsLinkInput.value.trim()) setStatus("الصق رابط Google Maps يحتوي على الإحداثيات.", true);
    return;
  }

  setLocation(coordinates.lat, coordinates.lng, "تم إضافة موقع Google Maps. تأكد من الدبوس ثم أرسل.");
});

useLocationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("المتصفح لا يدعم تحديد الموقع. حدد المنزل على الخريطة بدلا من ذلك.", true);
    return;
  }

  setStatus("جاري طلب الموقع من الجوال...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLocation(position.coords.latitude, position.coords.longitude, "تم إضافة الموقع. تأكد من الدبوس ثم أرسل.");
    },
    () => {
      setStatus("تم منع الوصول للموقع. حدد المنزل على الخريطة بدلا من ذلك.", true);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const lat = Number(latInput.value);
  const lng = Number(lngInput.value);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    setStatus("يرجى تحديد موقع صحيح على الخريطة.", true);
    return;
  }

  setStatus("جاري إرسال الموقع...");

  try {
    const response = await fetch("/api/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, note: noteInput.value }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "تعذر إرسال الموقع.");

    form.reset();
    mapsLinkInput.value = "";
    if (map && marker) {
      marker.setLatLng(defaultPosition);
      map.setView(defaultPosition, 12);
    }
    setStatus("تم إرسال الموقع. شكرا لك.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

initMap();
