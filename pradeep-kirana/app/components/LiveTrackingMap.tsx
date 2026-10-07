"use client";

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Script from 'next/script';

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
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const MAPPLS_STATIC_KEY = "qlaeohfcufkbsaefmopjepsodselrxdmhxgz";

  const initMap = () => {
    if (!window.mappls || isMapLoaded) return;
    const mapContainerId = `mappls-map-${orderId}`;
    const mapContainer = document.getElementById(mapContainerId);

    if (mapContainer) {
      try {
        mapRef.current = new window.mappls.Map(mapContainerId, {
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
      }
    }
  };

  useEffect(() => {
    if (scriptLoaded) {
      initMap();
    }
  }, [scriptLoaded]);

  // Firebase Live Location Sync
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
      {/* Next.js ka official Script component jo CORB block ko bypass karega */}
      <Script
        src={`https://apis.mappls.com/advancedmaps/api/${MAPPLS_STATIC_KEY}/map_sdk?layer=vector&v=3.0`}
        strategy="afterInteractive"
        onLoad={() => {
          setScriptLoaded(true);
          initMap();
        }}
      />

      <h3 className="mb-3 text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        📍 Live Delivery Tracking
      </h3>
      
      <div 
        id={`mappls-map-${orderId}`} 
        className="w-full h-[300px] sm:h-[350px] rounded-xl overflow-hidden relative shadow-inner border border-gray-200 dark:border-gray-800"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        {!isMapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="animate-pulse text-gray-500 font-semibold">Connecting to Satellite...</span>
          </div>
        )}
      </div>
    </div>
  );
}