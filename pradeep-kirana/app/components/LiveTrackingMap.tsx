"use client";

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

declare global {
  interface Window {
    L: any;
  }
}

interface LiveTrackingMapProps {
  orderId: string;
  initialLat: number; // Customer Lat
  initialLng: number; // Customer Lng
}

export default function LiveTrackingMap({ orderId, initialLat, initialLng }: LiveTrackingMapProps) {
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const storeMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const proximityCircleRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const STORE_LAT = 26.546071898155272;
  const STORE_LNG = 80.48609243450935;

  const isInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef<any>(null);
  const latestBoundsRef = useRef<any>(null);
  const currentAngleRef = useRef<number>(0);

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const getBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad * 180) / Math.PI;

    const startLatRad = toRad(startLat);
    const destLatRad = toRad(destLat);
    const deltaLngRad = toRad(destLng - startLng);

    const y = Math.sin(deltaLngRad) * Math.cos(destLatRad);
    const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
              Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(deltaLngRad);
    
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
  };

  useEffect(() => {
    let isMounted = true;

    const initMap = () => {
      if (!isMounted || !window.L || mapRef.current) return;

      const mapContainerId = `map-${orderId}`;
      const container = document.getElementById(mapContainerId);
      if (!container) return;

      try {
        mapRef.current = window.L.map(mapContainerId, {
          zoomControl: true, scrollWheelZoom: true, doubleClickZoom: true, touchZoom: true 
        }).setView([initialLat, initialLng], 14);

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '© OpenStreetMap', className: 'dark-map-filter' 
        }).addTo(mapRef.current);

        // 1. STORE PIN
        const storeSVG = `
          <div style="filter: drop-shadow(0 0 12px rgba(59, 130, 246, 1)); animation: float 3s infinite ease-in-out;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3b82f6" width="48" height="48">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              <path d="M8.5 6.5l-1 1.5v1h9v-1l-1-1.5h-7zm0 3h1.5v2.5h-1.5v-2.5zm2.5 0h1.5v2.5h-1.5v-2.5zm2.5 0h1.5v2.5h-1.5v-2.5z" fill="#ffffff" />
            </svg>
          </div>
        `;
        const storeIcon = window.L.divIcon({ html: storeSVG, className: "custom-icon", iconSize: [48, 48], iconAnchor: [24, 48] });
        storeMarkerRef.current = window.L.marker([STORE_LAT, STORE_LNG], { icon: storeIcon }).addTo(mapRef.current);

        // 2. CUSTOMER PIN
        const customerHomeSVG = `
          <div style="filter: drop-shadow(0 0 10px rgba(244, 63, 94, 0.9)); animation: float 2s infinite ease-in-out;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f43f5e" width="46" height="46">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              <path d="M12 6.5l-3 2.5h1.8v2.5h2.4v-2.5H15z" fill="#ffffff" />
            </svg>
          </div>
        `;
        const homeIcon = window.L.divIcon({ html: customerHomeSVG, className: "custom-icon", iconSize: [46, 46], iconAnchor: [23, 46] });
        customerMarkerRef.current = window.L.marker([initialLat, initialLng], { icon: homeIcon }).addTo(mapRef.current);

        // 3. TOP-VIEW RIDER ICON
        const topViewRiderHTML = `
          <div id="rider-icon-rotate-${orderId}" style="transform: rotate(0deg); transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1); filter: drop-shadow(0px 8px 6px rgba(0,0,0,0.6)); display: flex; justify-content: center; align-items: center;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="52" height="52">
              <rect x="28" y="2" width="8" height="16" rx="4" fill="#0f172a"/>
              <path d="M16 18 Q 32 10 48 18" fill="none" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
              <rect x="22" y="14" width="20" height="38" rx="8" fill="#1e293b"/>
              <rect x="14" y="38" width="36" height="24" rx="4" fill="#f97316" stroke="#ea580c" stroke-width="2"/>
              <rect x="18" y="24" width="28" height="12" rx="6" fill="#ef4444"/>
              <circle cx="32" cy="24" r="9" fill="#ef4444" stroke="#dc2626" stroke-width="2"/>
              <path d="M26 20 Q 32 16 38 20" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
            </svg>
          </div>
        `;
        const bikeIcon = window.L.divIcon({ html: topViewRiderHTML, className: "custom-icon", iconSize: [52, 52], iconAnchor: [26, 26] });
        driverMarkerRef.current = window.L.marker([STORE_LAT, STORE_LNG], { icon: bikeIcon }).addTo(mapRef.current);

        // INTERACTION LISTENER
        const handleInteractionStart = () => {
          isInteractingRef.current = true;
          if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
        };

        const handleInteractionEnd = () => {
          if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
          interactionTimeoutRef.current = setTimeout(() => {
            isInteractingRef.current = false;
            if (latestBoundsRef.current && mapRef.current) {
              mapRef.current.fitBounds(latestBoundsRef.current, { padding: [70, 70], maxZoom: 15, animate: true, duration: 1.5 });
            }
          }, 5000); 
        };

        mapRef.current.on('dragstart zoomstart mousedown touchstart', handleInteractionStart);
        mapRef.current.on('dragend zoomend mouseup touchend', handleInteractionEnd);

        setIsMapLoaded(true);
      } catch (e) {
        console.error("Leaflet Init Error:", e);
      }
    };

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link'); link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    }
    if (!document.getElementById('leaflet-script')) {
      const script = document.createElement('script'); script.id = 'leaflet-script'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.async = true; script.onload = initMap; document.head.appendChild(script);
    } else {
      if (window.L) initMap(); else document.getElementById('leaflet-script')?.addEventListener('load', initMap);
    }

    return () => { isMounted = false; if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current); };
  }, [orderId, initialLat, initialLng]);

  // LIVE GPS SYNC + PROXIMITY FIX
  useEffect(() => {
    if (!orderId || !isMapLoaded || !mapRef.current || !driverMarkerRef.current) return;

    const unsubscribe = onSnapshot(doc(db, "orders", orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.driverLocation) {
          const dLat = data.driverLocation.lat;
          const dLng = data.driverLocation.lng;

          driverMarkerRef.current.setLatLng([dLat, dLng]);
          
          const currDistance = getDistance(dLat, dLng, initialLat, initialLng);
          const PROXIMITY_RADIUS = 150; // 150 Meters

          // GREEN RADAR CIRCLE
          if (currDistance < PROXIMITY_RADIUS) {
            if (!proximityCircleRef.current) {
              proximityCircleRef.current = window.L.circle([initialLat, initialLng], {
                radius: 120, color: '#00E676', fillColor: '#00E676', fillOpacity: 0.2, weight: 2, className: "glowing-pulsing-circle"
              }).addTo(mapRef.current);
            }
          } else if (proximityCircleRef.current) {
            mapRef.current.removeLayer(proximityCircleRef.current);
            proximityCircleRef.current = null;
          }

          // 🔥 LAST-MILE APPROACH FIX (Bug Killer) 🔥
          if (currDistance < PROXIMITY_RADIUS) {
            // Agar gaadi 150 meter se paas aa gayi hai, OSRM road snapping band kardo!
            // Seedha target ki taraf dekho aur seedhi line kheecho.
            const newAngle = getBearing(dLat, dLng, initialLat, initialLng);
            const prevAngle = currentAngleRef.current;
            let delta = newAngle - prevAngle;
            delta = ((delta + 180) % 360 + 360) % 360 - 180; 
            currentAngleRef.current = prevAngle + delta;

            const riderIcon = document.getElementById(`rider-icon-rotate-${orderId}`);
            if (riderIcon) riderIcon.style.transform = `rotate(${currentAngleRef.current}deg)`;

            const directCoords = [[dLat, dLng], [initialLat, initialLng]];
            if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
            routeLayerRef.current = window.L.polyline(directCoords, {
              color: '#00ff66', weight: 5, opacity: 0.95, dashArray: '8, 10', lineCap: 'round', lineJoin: 'round', className: "glowing-green-path"
            }).addTo(mapRef.current);

            // Camera ko zoom-in karke sirf rider aur customer par focus karo (Store frame se hatao)
            const bounds = window.L.latLngBounds(directCoords);
            latestBoundsRef.current = bounds; 
            if (!isInteractingRef.current) {
              mapRef.current.fitBounds(bounds, { padding: [100, 100], maxZoom: 16, animate: true, duration: 1.2 });
            }

          } else {
            // Agar gaadi door hai, toh Normal Road Routing (OSRM) chalne do
            fetch(`https://router.project-osrm.org/route/v1/driving/${dLng},${dLat};${initialLng},${initialLat}?overview=full&geometries=geojson&continue_straight=true`)
              .then(res => res.json())
              .then(routeData => {
                if (routeData.routes && routeData.routes.length > 0) {
                  const roadCoords = routeData.routes[0].geometry.coordinates.map((c: any[]) => [c[1], c[0]]);
                  const fullSnappedCoords = [[dLat, dLng], ...roadCoords, [initialLat, initialLng]];

                  if (roadCoords.length > 1) {
                    const [startLat, startLng] = roadCoords[0];
                    const [nextLat, nextLng] = roadCoords[1];

                    const newAngle = getBearing(startLat, startLng, nextLat, nextLng);
                    const prevAngle = currentAngleRef.current;
                    let delta = newAngle - prevAngle;
                    delta = ((delta + 180) % 360 + 360) % 360 - 180; 
                    currentAngleRef.current = prevAngle + delta;

                    const riderIcon = document.getElementById(`rider-icon-rotate-${orderId}`);
                    if (riderIcon) riderIcon.style.transform = `rotate(${currentAngleRef.current}deg)`;
                  }

                  if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
                  routeLayerRef.current = window.L.polyline(fullSnappedCoords, {
                    color: '#00ff66', weight: 5, opacity: 0.95, dashArray: '8, 10', lineCap: 'round', lineJoin: 'round', className: "glowing-green-path"
                  }).addTo(mapRef.current);

                  // Teeno cheezein frame me rakho
                  const bounds = window.L.latLngBounds([[dLat, dLng], [initialLat, initialLng], [STORE_LAT, STORE_LNG]]);
                  latestBoundsRef.current = bounds; 
                  if (!isInteractingRef.current) {
                    mapRef.current.fitBounds(bounds, { padding: [70, 70], maxZoom: 14, animate: true, duration: 1.2 });
                  }
                }
              })
              .catch(err => console.error(err));
          }
        }
      }
    });

    return () => unsubscribe();
  }, [orderId, isMapLoaded, initialLat, initialLng]);

  return (
    <div style={{ width: '100%', marginTop: '10px' }}>
      <style>{`
        @keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-5px); } 100% { transform: translateY(0); } }
        @keyframes pulse-ring { 0% { stroke-width: 1.5px; fill-opacity: 0.12; } 50% { stroke-width: 3.5px; fill-opacity: 0.3; } 100% { stroke-width: 1.5px; fill-opacity: 0.12; } }
        .glowing-pulsing-circle { animation: pulse-ring 1.5s infinite ease-in-out !important; stroke-dasharray: 4, 4; }
        .custom-icon { background: transparent !important; border: none !important; }
        .dark-map-filter { filter: invert(100%) hue-rotate(180deg) saturate(0.3) brightness(1.1) contrast(90%); }
        .glowing-green-path { filter: drop-shadow(0 0 6px rgba(0, 255, 102, 0.8)); }
        .leaflet-control-zoom a { background-color: #1f2937 !important; color: #9ca3af !important; border-color: #374151 !important; }
        .leaflet-control-zoom a:hover { color: #fff !important; background-color: #374151 !important; }
      `}</style>
      <h3 className="mb-3 text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">📍 Live Delivery Tracking Route</h3>
      <div id={`map-${orderId}`} className="w-full h-[350px] sm:h-[400px] rounded-2xl shadow-inner border border-gray-200 dark:border-gray-800 relative z-0" style={{ backgroundColor: '#111827' }}>
        {!isMapLoaded && (
          <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center bg-[#0d1117] z-10 rounded-2xl">
            <span className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></span>
            <span className="text-gray-400 text-xs font-semibold animate-pulse">Establishing Satellite Signal...</span>
          </div>
        )}
      </div>
    </div>
  );
}