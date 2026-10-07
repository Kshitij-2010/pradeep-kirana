"use client";

import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// 🔥 1. TypeScript ko batana ki window ke andar 'mappls' aayega
declare global {
  interface Window {
    mappls: any;
  }
}

// 🔥 2. Props ka Data Type define karna
interface LiveTrackingMapProps {
  orderId: string;
  initialLat: number;
  initialLng: number;
}

export default function LiveTrackingMap({ orderId, initialLat, initialLng }: LiveTrackingMapProps) {
  // 🔥 3. useRef me <any> lagana taaki 'never' error na aaye
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => {
    // APNI STATIC KEY YAHAN DALO
    const MAPPLS_STATIC_KEY = "qlaeohfcufkbsaefmopjepsodselrxdmhxgz"; 

    const script = document.createElement('script');
    script.src = `https://apis.mappls.com/advancedmaps/api/${MAPPLS_STATIC_KEY}/map_sdk?layer=vector&v=3.0`;
    script.async = true;
    script.onload = () => {
      initMap();
      setIsMapLoaded(true);
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const initMap = () => {
    if (!window.mappls) return;

    mapRef.current = new window.mappls.Map('mappls-live-map', {
      center: [initialLat || 28.6139, initialLng || 77.2090],
      zoom: 16,
      zoomControl: true,
      hybrid: false
    });

    markerRef.current = new window.mappls.Marker({
      map: mapRef.current,
      position: { lat: initialLat, lng: initialLng },
    });
  };

  useEffect(() => {
    if (!orderId || !isMapLoaded) return;

    const unsubscribe = onSnapshot(doc(db, "orders", orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.driverLocation && markerRef.current && mapRef.current) {
          const newLat = data.driverLocation.lat;
          const newLng = data.driverLocation.lng;

          markerRef.current.setPosition({ lat: newLat, lng: newLng });
          mapRef.current.panTo([newLat, newLng]); 
        }
      }
    });

    return () => unsubscribe();
  }, [orderId, isMapLoaded]);

  return (
    <div style={{ width: '100%', marginTop: '20px' }}>
      <h3 style={{ marginBottom: '10px', fontSize: '18px', fontWeight: 'bold' }}>📍 Live Delivery Tracking</h3>
      
      <div 
        id="mappls-live-map" 
        style={{ 
          width: '100%', 
          height: '400px', 
          borderRadius: '12px', 
          overflow: 'hidden',
          backgroundColor: '#e5e5e5'
        }}
      >
        {!isMapLoaded && <p style={{ padding: '20px' }}>Loading Map...</p>}
      </div>
    </div>
  );
}