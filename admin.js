document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let map = null;
    const usersMap = new Map(); // Store markers and DOM elements by user ID
    
    const activeCount = document.getElementById('activeCount');
    const usersList = document.getElementById('usersList');

    // Initialize Map
    function initMap() {
        map = L.map('adminMap').setView([24.7136, 46.6753], 5); // Default center (Riyadh, SA)
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
    }
    
    initMap();

    // Socket Events
    socket.emit('admin_join');

    socket.on('initial_locations', (users) => {
        users.forEach(user => updateOrAddUser(user));
        updateCount();
    });

    socket.on('user_location_updated', (user) => {
        updateOrAddUser(user);
        updateCount();
    });

    socket.on('user_disconnected', (userId) => {
        removeUser(userId);
        updateCount();
    });

    // Helper Functions
    function updateOrAddUser(userData) {
        const { id, lat, lon, addressDetails, username } = userData;
        const displayName = username ? username : `مجهول #${id.substring(0,4)}`;
        
        let displayLocation = "موقع غير محدد";
        if (addressDetails) {
            const city = addressDetails.city || addressDetails.town || addressDetails.village || '';
            const country = addressDetails.country || '';
            displayLocation = `${city} ${country ? '- ' + country : ''}`;
        }

        if (usersMap.has(id)) {
            // Update existing user
            const userObj = usersMap.get(id);
            userObj.marker.setLatLng([lat, lon]);
            
            // Update DOM
            userObj.element.querySelector('.user-coords').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
            if (addressDetails) {
                userObj.element.querySelector('.user-location').textContent = displayLocation;
                userObj.marker.bindPopup(`
                    <div style="text-align: right; font-family: 'Tajawal', sans-serif;">
                        <strong>${displayName}</strong><br>
                        ${displayLocation}
                    </div>
                `, { className: 'custom-popup' });
            }
        } else {
            // Add new user
            const customIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });

            const marker = L.marker([lat, lon], {icon: customIcon}).addTo(map);
            marker.bindPopup(`
                <div style="text-align: right; font-family: 'Tajawal', sans-serif;">
                    <strong>${displayName}</strong><br>
                    ${displayLocation}
                </div>
            `, { className: 'custom-popup' });

            const li = document.createElement('li');
            li.className = 'user-card';
            li.innerHTML = `
                <div class="user-id">👤 ${displayName}</div>
                <div class="user-location">${displayLocation}</div>
                <div class="user-coords">${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
            `;
            
            li.addEventListener('click', () => {
                // Remove active class from all
                document.querySelectorAll('.user-card').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                
                map.flyTo([lat, lon], 16, {
                    duration: 1.5
                });
                marker.openPopup();
            });

            usersList.appendChild(li);

            usersMap.set(id, {
                marker,
                element: li
            });
            
            // Auto fit bounds if this is the first user
            if (usersMap.size === 1) {
                map.setView([lat, lon], 12);
            }
        }
    }

    function removeUser(id) {
        if (usersMap.has(id)) {
            const userObj = usersMap.get(id);
            map.removeLayer(userObj.marker);
            userObj.element.remove();
            usersMap.delete(id);
        }
    }

    function updateCount() {
        activeCount.textContent = usersMap.size;
    }
});
