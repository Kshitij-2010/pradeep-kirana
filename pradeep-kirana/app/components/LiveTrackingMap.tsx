"use client";

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

declare global {
  interface Window {
    mappls: any;
  }
}

interface LiveTrackingMapProps {
  orderId: string;
  initialLat: number;
  initialLng: number;
}

export default function LiveTrackingMap({ orderId, initialLat, initialLng }: LiveTrackingMapProps) {
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    // 🔥 APNI STATIC KEY YAHAN DALO 🔥
    const MAPPLS_STATIC_KEY = "qlaeohfcufkbsaefmopjepsodselrxdmhxgz"; 

    // React StrictMode me double load se bachne ke liye check
    if (document.getElementById('mappls-sdk-script')) {
      if (window.mappls && !isMapLoaded) {
        initMap();
        setIsMapLoaded(true);
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'mappls-sdk-script';
    
    // 🔥 MAIN FIX: Naye accounts ke liye Mappls ka naya SDK URL 🔥
    script.src = `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${MAPPLS_STATIC_KEY}`;
    script.async = true;
    
    script.onload = () => {
      initMap();
      setIsMapLoaded(true);
    };
    
    script.onerror = () => {
      setMapError("Failed to load map. Please check your Static Key.");
    };

    document.head.appendChild(script);

    return () => {
      // Unmount par script remove nahi karenge taki wapas aane par fast load ho
    };
  }, []);

  const initMap = () => {
    if (!window.mappls) return;

    // Timeout isliye taaki UI render hone ka wait kare aur map container mil jaye
    setTimeout(() => {
      const mapContainer = document.getElementById(`mappls-map-${orderId}`);
      if (!mapContainer) return;

      try {
        mapRef.current = new window.mappls.Map(`mappls-map-${orderId}`, {
          center: { lat: initialLat || 28.6139, lng: initialLng || 77.2090 },
          zoom: 16,
          zoomControl: true,
          hybrid: false
        });

        markerRef.current = new window.mappls.Marker({
          map: mapRef.current,
          position: { lat: initialLat || 28.6139, lng: initialLng || 77.2090 },
        });
      } catch (err) {
        console.error("Mappls Init Error:", err);
      }
    }, 200);
  };

  // 🔥 FIREBASE LIVE LOCATION SYNC 🔥
  useEffect(() => {
    if (!orderId || !isMapLoaded || !mapRef.current || !markerRef.current) return;

    const unsubscribe = onSnapshot(doc(db, "orders", orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.driverLocation) {
          const newLat = data.driverLocation.lat;
          const newLng = data.driverLocation.lng;

          // Gaadi (Marker) ko smooth move karna
          markerRef.current.setPosition({ lat: newLat, lng: newLng });
          
          // Map ka camera driver ke sath-sath chalana
          if (typeof mapRef.current.panTo === 'function') {
             mapRef.current.panTo({ lat: newLat, lng: newLng });
          } else {
             mapRef.current.setCenter({ lat: newLat, lng: newLng });
          }
        }
      }
    });

    return () => unsubscribe();
  }, [orderId, isMapLoaded]);

  return (
    <div style={{ width: '100%', marginTop: '10px' }}>
      <h3 className="mb-3 text-sm font-bold text-gray-400 uppercase tracking-wider">
        📍 Live Delivery Tracking
      </h3>
      
      <div 
        id={`mappls-map-${orderId}`} 
        className="w-full h-[350px] sm:h-[400px] rounded-xl overflow-hidden relative shadow-inner border border-gray-200 dark:border-gray-800"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        {!isMapLoaded && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="animate-pulse text-gray-500 font-semibold">Loading Live Map...</span>
          </div>
        )}
        
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 dark:bg-red-900/20">
            <span className="text-red-500 font-bold">{mapError}</span>
          </div>
        )}
      </div>
    </div>
  );
}