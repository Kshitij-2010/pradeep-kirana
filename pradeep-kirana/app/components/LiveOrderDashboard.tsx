"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import LiveTrackingMap from "./LiveTrackingMap"; // Tumhara purana map component yahan import hoga

interface OrderDashboardProps {
  orderId: string;
  initialLat: number; // Customer Lat
  initialLng: number; // Customer Lng
}

export default function LiveOrderDashboard({ orderId, initialLat, initialLng }: OrderDashboardProps) {
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [liveETA, setLiveETA] = useState<number>(0);

  // 🔥 HAVERSINE FORMULA TO CALCULATE LIVE ETA 🔥
  const calculateETA = (driverLat: number, driverLng: number, custLat: number, custLng: number) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (custLat - driverLat) * (Math.PI / 180);
    const dLng = (custLng - driverLng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(driverLat * (Math.PI / 180)) *
        Math.cos(custLat * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const distanceInMeters = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    
    // Assuming average city speed of 24 km/h (400 meters per minute)
    const estimatedMinutes = Math.ceil(distanceInMeters / 400); 
    // Minimum 1 min dikhayega agar bahut paas hai
    setLiveETA(estimatedMinutes > 0 ? estimatedMinutes : 1); 
  };

  useEffect(() => {
    if (!orderId) return;
    
    // Fetch live order details from Firebase
    const unsubscribe = onSnapshot(doc(db, "orders", orderId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOrderDetails(data);

        // Update ETA dynamically if driver location changes
        if (data.driverLocation) {
          calculateETA(data.driverLocation.lat, data.driverLocation.lng, initialLat, initialLng);
        }
      }
    });

    return () => unsubscribe();
  }, [orderId, initialLat, initialLng]);

  if (!orderDetails) {
    return (
      <div className="w-full h-40 flex items-center justify-center text-gray-400 animate-pulse">
        Loading Order Dashboard...
      </div>
    );
  }

  // Fallback Dummy Data (Agar Firebase me driver/items abhi add nahi kiye hain)
  const driver = orderDetails.driver || {
    name: "Ramesh Kumar",
    phone: "+91 9876543210",
    vehicleNumber: "UP 35 AB 1234",
    photoUrl: "https://cdn-icons-png.flaticon.com/512/4140/4140048.png"
  };

  const invoice = {
    items: orderDetails.items || [
      { name: "Ashirvaad Atta 5kg", qty: 1, price: 210 },
      { name: "Amul Butter 100g", qty: 2, price: 110 }
    ],
    subtotal: orderDetails.subtotal || 320,
    deliveryFee: orderDetails.deliveryFee || 15,
    total: orderDetails.totalAmount || 335
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-[#0B1120] min-h-screen text-gray-200 pb-10 font-sans">
      
      {/* 🟢 1. LIVE ETA HEADER */}
      <div className="p-4">
        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/20 border border-green-500/30 rounded-2xl p-5 shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-green-400 drop-shadow-md">
              {liveETA} mins
            </h2>
            <p className="text-sm text-green-300/80 font-medium mt-1 uppercase tracking-wide">
              Estimated Arrival Time
            </p>
          </div>
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
            {/* Clock Icon SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* 🗺️ 2. MAP COMPONENT (Tumhara purana code yahan render hoga) */}
      <div className="px-4">
        <LiveTrackingMap orderId={orderId} initialLat={initialLat} initialLng={initialLng} />
      </div>

      {/* 👨‍✈️ 3. DELIVERY PARTNER CARD */}
      <div className="px-4 mt-6">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Delivery Partner</h3>
        <div className="bg-[#111827] border border-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-800 rounded-full border-2 border-gray-700 overflow-hidden flex-shrink-0">
              <img src={driver.photoUrl} alt="Driver" className="w-full h-full object-cover" />
            </div>
            <div>
              <h4 className="font-bold text-gray-100 text-lg">{driver.name}</h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded font-mono border border-gray-700">
                  {driver.vehicleNumber}
                </span>
              </div>
            </div>
          </div>
          
          {/* Action Buttons (Call & Message) */}
          <div className="flex gap-3">
            <a 
              href={`tel:${driver.phone}`} 
              className="w-11 h-11 bg-green-500 hover:bg-green-400 text-gray-900 rounded-full flex items-center justify-center transition-colors shadow-[0_0_10px_rgba(34,197,94,0.4)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* 🧾 4. ORDER SUMMARY & INVOICE */}
      <div className="px-4 mt-6">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Order Summary</h3>
        <div className="bg-[#111827] border border-gray-800 rounded-2xl p-5 shadow-lg">
          
          {/* Items List */}
          <div className="space-y-4 mb-5">
            {invoice.items.map((item: any, index: number) => (
              <div key={index} className="flex justify-between items-start text-sm">
                <div className="flex gap-3">
                  <div className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center text-xs font-bold text-gray-400 border border-gray-700">
                    {item.qty}x
                  </div>
                  <span className="text-gray-300">{item.name}</span>
                </div>
                <span className="text-gray-300 font-medium">₹{item.price}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 border-dashed my-4"></div>

          {/* Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Item Total</span>
              <span>₹{invoice.subtotal}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Delivery Partner Fee</span>
              <span className="text-green-400">₹{invoice.deliveryFee}</span>
            </div>
          </div>

          <div className="border-t border-gray-800 my-4"></div>

          {/* Grand Total */}
          <div className="flex justify-between items-center">
            <span className="text-gray-100 font-bold text-lg">Grand Total</span>
            <span className="text-gray-100 font-extrabold text-xl">₹{invoice.total}</span>
          </div>
          
          {/* Payment Status Tag */}
          <div className="mt-4 bg-gray-800/50 rounded-lg p-3 flex items-center gap-2 border border-gray-700/50">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-300 font-medium tracking-wide">PAID VIA UPI</span>
          </div>

        </div>
      </div>

    </div>
  );
}