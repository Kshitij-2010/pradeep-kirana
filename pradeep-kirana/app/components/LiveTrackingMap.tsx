"use client";

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { mappls } from 'mappls-web-maps'; 

// 🔥 TYPESCRIPT FIX: TS ko lagta hai mappls khali hai, isliye isko 'any' me convert kiya 🔥
const mapplsAny = mappls as any;

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
    let isMounted = true;

    // 🔥 APNI STATIC KEY YAHAN DALO 🔥
    const MAPPLS_STATIC_KEY = "qlaeohfcufkbsaefmopjepsodselrxdmhxgz"; 

    // Yahan mapplsAny use karenge taaki TS laal line na de
    mapplsAny.initialize(MAPPLS_STATIC_KEY, () => {
      if (!isMounted) return;
      
      try {
        const mapObject = new mapplsAny.Map(`mappls-map-${orderId}`, {
          center: [initialLat || 28.6139, initialLng || 77.2090],
          zoom: 16,
          zoomControl: true,
          hybrid: false
        });

        mapObject.addListener('load', () => {
          if (!isMounted) return;
          
          mapRef.current = mapObject;
          markerRef.current = new mapplsAny.Marker({
            map: mapObject,
            position: { lat: initialLat || 28.6139, lng: initialLng || 77.2090 },
          });
          
          setIsMapLoaded(true);
        });

      } catch (error) {
        console.error("Mappls Init Error:", error);
        if (isMounted) setMapError("Map initialization failed. Please check your credentials.");
      }
    });

    return () => {
      isMounted = false;
      if (mapRef.current && typeof mapRef.current.destroy === 'function') {
         mapRef.current.destroy();
      }
    };
  }, [orderId, initialLat, initialLng]);

  // 🔥 FIREBASE LIVE LOCATION SYNC 🔥
  useEffect(() => {
    if (!orderId || !isMapLoaded || !mapRef.current || !markerRef.current) return;

    const unsubscribe = onSnapshot(doc(db, "orders", orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.driverLocation) {
          const newLat = data.driverLocation.lat;
          const newLng = data.driverLocation.lng;

          try {
            markerRef.current.setPosition({ lat: newLat, lng: newLng });
            mapRef.current.panTo({ lat: newLat, lng: newLng });
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