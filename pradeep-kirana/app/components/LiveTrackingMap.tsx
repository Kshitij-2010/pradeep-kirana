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

  // 🔥 1. SCRIPT LOAD & BULLETPROOF INITIALIZATION 🔥
  useEffect(() => {
    // Ye tumhari original working key hai
    const MAPPLS_STATIC_KEY = "qlaeohfcufkbsaefmopjepsodselrxdmhxgz"; 
    let initAttempts = 0;
    let isMounted = true;

    // Retry function: Next.js aur Mappls ki timing mismatch fix karne ke liye
    const checkAndInitMap = () => {
      if (!isMounted) return;
      const mapContainer = document.getElementById(`mappls-map-${orderId}`);
      
      if (window.mappls && mapContainer && !isMapLoaded) {
        try {
          mapRef.current = new window.mappls.Map(`mappls-map-${orderId}`, {
            center: [initialLat || 28.6139, initialLng || 77.2090],
            zoom: 16,
            zoomControl: true,
            hybrid: false
          });

          markerRef.current = new window.mappls.Marker({
            map: mapRef.current,
            position: { lat: initialLat || 28.6139, lng: initialLng || 77.2090 },
          });
          
          setIsMapLoaded(true);
        } catch (error) {
          console.error("Mappls Init Error:", error);
          setMapError("Mappls Error: Please ensure your Vercel domain is correctly whitelisted in Mappls Dashboard without trailing slashes.");
        }
      } else if (!isMapLoaded && initAttempts < 10) {
         initAttempts++;
         setTimeout(checkAndInitMap, 500); // 0.5 sec baad wapas try karega (Max 5 sec tak)
      } else if (!isMapLoaded) {
         setMapError("Map Load Timeout. Network weak hai ya script block ho rahi hai.");
      }
    };

    // Script injection logic
    if (document.getElementById('mappls-sdk-script')) {
      checkAndInitMap();
    } else {
      const script = document.createElement('script');
      script.id = 'mappls-sdk-script';
      script.src = `https://apis.mappls.com/advancedmaps/api/${MAPPLS_STATIC_KEY}/map_sdk?layer=vector&v=3.0`;
      script.async = true;
      script.onload = checkAndInitMap;
      script.onerror = () => setMapError("Mappls Script Failed to Load. Please check Adblocker or Network.");
      document.head.appendChild(script);
    }

    return () => {
      isMounted = false;
    };
  }, [orderId, initialLat, initialLng, isMapLoaded]);

  // 🔥 2. FIREBASE LIVE LOCATION SYNC 🔥
  useEffect(() => {
    if (!orderId || !isMapLoaded || !mapRef.current || !markerRef.current) return;

    const unsubscribe = onSnapshot(doc(db, "orders", orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.driverLocation) {
          const newLat = data.driverLocation.lat;
          const newLng = data.driverLocation.lng;

          try {
            // Gaadi aur Camera dono chalenge
            markerRef.current.setPosition({ lat: newLat, lng: newLng });
            mapRef.current.panTo([newLat, newLng]); 
          } catch(e) {
             console.error("Error moving map/marker:", e);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [orderId, isMapLoaded]);

  return (
    <div style={{ width: '100%', marginTop: '10px' }}>
      <h3 className="mb-3 text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        📍 Live Delivery Tracking
      </h3>
      
      <div 
        id={`mappls-map-${orderId}`} 
        className="w-full h-[300px] sm:h-[350px] rounded-xl overflow-hidden relative shadow-inner border border-gray-200 dark:border-gray-800"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        {!isMapLoaded && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="animate-pulse text-gray-500 font-semibold">Connecting to Satellite...</span>
          </div>
        )}

        {/* Agar error aaya, toh loading screen ki jagah reason dikhayega */}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/20 p-4 text-center">
            <span className="text-red-500 font-bold text-sm">{mapError}</span>
          </div>
        )}
      </div>
    </div>
  );
}