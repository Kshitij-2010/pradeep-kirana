"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, getDoc, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Package, Clock, CheckCircle, Bike, Store, ArrowLeft, ChevronRight, Tag, Truck, X, CheckCircle2, RotateCcw, AlertTriangle, Calendar, MapPin, PhoneCall } from "lucide-react";
import { useCart } from "@/context/CartContext";
import dynamic from 'next/dynamic';

// 🔥 SSR: false ensures map sirf browser me load ho, server par nahi
const LiveTrackingMap = dynamic(() => import('@/app/components/LiveTrackingMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-[300px] sm:h-[350px] flex items-center justify-center bg-gray-100 dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-gray-800 mt-2">
      <span className="animate-pulse text-gray-500 font-semibold">Loading Map Engine...</span>
    </div>
  )
});

// Modern & Soothing Success Notification Sound
const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const playTone = (freq: number, type: OscillatorType, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(523.25, 'sine', 0, 0.4);
    playTone(659.25, 'sine', 0.1, 0.5);
    playTone(783.99, 'sine', 0.2, 0.6);
  } catch (e) { console.error(e); }
};

// Soft Error/Alert Sound
const playAlertSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const playTone = (freq: number, type: OscillatorType, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(349.23, 'triangle', 0, 0.4);
    playTone(311.13, 'triangle', 0.15, 0.5);
  } catch (e) { console.error(e); }
};

const formatDate = (dateObj: any) => {
  if (!dateObj) return "Just now";
  if (dateObj.toDate) return dateObj.toDate().toLocaleString('en-IN');
  return new Date(dateObj).toLocaleString('en-IN');
};

// 🔥 HAVERSINE FORMULA FOR ETA CALCULATION 🔥
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderingId, setOrderingId] = useState<string | null>(null);
  
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' }>({ show: false, message: "", type: 'success' });
  
  const router = useRouter();
  const { addToCart, setIsCartOpen } = useCart() as any;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4500);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const q = query(collection(db, "orders"), where("customerId", "==", user.uid), orderBy("orderDate", "desc"));
        onSnapshot(q, (snapshot) => {
          const ordersData: any[] = [];
          snapshot.forEach((docSnap) => { ordersData.push({ id: docSnap.id, ...docSnap.data() }); });
          setOrders(ordersData);
          setLoading(false);
        });
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  // 🔥 DRIVER ACCEPT ORDER FUNCTION (UID/Email Based Verification) 🔥
  const handleDriverAcceptOrder = async (orderId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast("Please login as a delivery partner first.", "error");
      return;
    }

    try {
      // 1. Check if the user exists in 'deliveryPartners' collection using UID or Email
      let driverData: any = null;
      let driverId = currentUser.uid;

      const directDriverRef = doc(db, "deliveryPartners", driverId);
      const directSnap = await getDoc(directDriverRef);

      if (directSnap.exists()) {
        driverData = directSnap.data();
      } else {
        // Fallback: Query by email if UID doesn't match directly
        const q = query(collection(db, "deliveryPartners"), where("authInfo.customEmail", "==", currentUser.email));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          driverData = querySnap.docs[0].data();
          driverId = querySnap.docs[0].id;
        }
      }

      if (!driverData) {
        showToast("Access Denied: You are not registered as an official delivery partner.", "error");
        return;
      }

      // 2. Update the order with verified driver details
      playNotificationSound();
      await updateDoc(doc(db, "orders", orderId), {
        status: "Accepted",
        driverId: driverId,
        driver: {
          name: driverData.personalInfo?.name || "Delivery Partner",
          phone: driverData.personalInfo?.phone || "",
          vehicleNumber: driverData.vehicleInfo?.registrationNumber || "Assigned",
          photoUrl: driverData.personalInfo?.photoUrl || "https://cdn-icons-png.flaticon.com/512/4140/4140048.png"
        },
        driverLocation: driverData.liveTracking?.currentLocation || { lat: 26.546071, lng: 80.486092 }
      });

      showToast("Order accepted successfully! Live tracking initiated 🚀", "success");
    } catch (error) {
      console.error("Error accepting order:", error);
      showToast("Order accept karne me error aayi, dobara try karein.", "error");
    }
  };

  const handleConfirmReceipt = async (orderId: string, orderType: string) => {
    const newStatus = orderType === "Pickup" ? "Picked Up" : "Delivered";
    try {
      playNotificationSound();
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus,
        customerConfirmedAt: new Date()
      });
      showToast(`Thank you! Order marked as ${newStatus} successfully 🎉`, 'success');
    } catch (error) {
      console.error("Error updating status:", error);
      showToast("Status update nahi ho paya, please dobara try karein.", 'error');
    }
  };

  const handleOrderAgain = async (items: any[], orderId: string) => {
    if (!items || items.length === 0) return;
    setOrderingId(orderId);
    
    let outOfStockItems: string[] = [];
    let added = false;

    for (const oldItem of items) {
      try {
        const itemRef = doc(db, "items", oldItem.id);
        const itemSnap = await getDoc(itemRef);

        if (itemSnap.exists()) {
          const liveItem = { id: itemSnap.id, ...itemSnap.data() } as any;

          if (liveItem.stockQuantity > 0 && liveItem.isAvailable) {
            addToCart(liveItem);
            added = true;
          } else {
            outOfStockItems.push(oldItem.name);
          }
        } else {
          outOfStockItems.push(oldItem.name);
        }
      } catch (error) {
        console.error("Error checking stock:", error);
      }
    }

    setOrderingId(null);

    if (outOfStockItems.length > 0) {
      playAlertSound();
      showToast(`⚠️ Out of stock items: ${outOfStockItems.join(", ")}. Available items added to cart.`, 'error');
    } else if (added) {
      playNotificationSound();
      showToast("✅ Saare items successfully cart mein add ho gaye!", 'success');
    }
    
    if (added) {
      setIsCartOpen(true);
      router.push("/");
    }
  };

  const getStatusIndex = (status: string, isPickup: boolean) => {
    if (status === "Pending") return 1;
    if (status === "Accepted") return 2;
    if (isPickup) {
      if (status === "Ready for Pickup" || status === "Awaiting Pickup Confirmation") return 3;
      if (status === "Picked Up") return 4;
    } else {
      if (status === "Out for Delivery" || status === "On the Way" || status === "Awaiting Confirmation") return 3;
      if (status === "Delivered") return 4;
    }
    return 0;
  };

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-50 dark:bg-[#0a0a0a]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-4 md:p-8 transition-colors relative">
      
      {/* ================= TOAST NOTIFICATION BANNER ================= */}
      {toast.show && (
        <div className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 max-w-md p-4 rounded-2xl shadow-2xl flex items-center justify-between border animate-in slide-in-from-top-5 duration-300 ${
          toast.type === 'success' 
            ? 'bg-green-600 text-white border-green-400' 
            : 'bg-red-600 text-white border-red-400'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full shrink-0">
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Notification</p>
              <p className="text-sm font-extrabold leading-tight">{toast.message}</p>
            </div>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="p-1 hover:bg-black/20 rounded-full transition shrink-0"><X size={18} /></button>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        <header className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/')} className="p-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-full shadow-sm hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition"><ArrowLeft className="text-gray-800 dark:text-gray-200" size={20} /></button>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">My Orders</h1>
        </header>

        {orders.length === 0 ? (
          <div className="text-center bg-white dark:bg-[#121212] p-10 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
            <Package className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
            <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No orders yet!</h2>
            <p className="text-gray-500 mb-6 text-sm">Looks like you haven't bought anything from us.</p>
            <button onClick={() => router.push('/')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition shadow-md">Start Shopping</button>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const isPickup = order.customerDetails?.orderType === "Pickup" || order.deliveryType === "Pickup";
              const isDelivery = !isPickup;
              const isCancelled = order.status === "Cancelled";
              const currentIndex = getStatusIndex(order.status, isPickup);
              
              const steps = isPickup 
                ? ["Pending", "Accepted", "Ready", "Picked Up"]
                : ["Pending", "Accepted", "On the Way", "Delivered"];

              const needsConfirmation = (order.status === "Awaiting Confirmation" || order.status === "Awaiting Pickup Confirmation");
              const showLiveMap = isDelivery && !isCancelled && (order.status === "Accepted" || order.status === "Out for Delivery" || order.status === "On the Way" || order.status === "Awaiting Confirmation");
              
              let liveETA = 0;
              if (order.driverLocation && order.customerDetails?.lat) {
                const dist = getDistance(order.driverLocation.lat, order.driverLocation.lng, order.customerDetails.lat, order.customerDetails.lng);
                liveETA = Math.max(1, Math.ceil(dist / 400));
              }

              const driver = order.driver || {
                name: "Delivery Partner",
                phone: "",
                vehicleNumber: "Assigning...",
                photoUrl: "https://cdn-icons-png.flaticon.com/512/4140/4140048.png"
              };

              return (
                <div key={order.id} className="bg-white dark:bg-[#121212] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
                  
                  {/* ================= ORDER HEADER ================= */}
                  <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1e1e1e]/50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Order ID</p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <h3 className="font-black text-gray-900 dark:text-white text-xl sm:text-2xl">{order.orderId || "OLD-ORDER"}</h3>
                          
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border flex items-center gap-1 shrink-0 ${isPickup ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50'}`}>
                              {isPickup ? <Store size={12}/> : <Truck size={12}/>} {isPickup ? 'PICKUP' : 'DELIVERY'}
                            </span>
                            
                            {order.status === "Pending" && isDelivery && (
                              <div className="flex items-center gap-2">
                                <span className="text-yellow-600 dark:text-yellow-400 text-[11px] font-bold animate-pulse flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/20 px-2.5 py-1 rounded-md border border-yellow-200 dark:border-yellow-800/30 shrink-0">
                                  <Clock size={12} /> Waiting for partner...
                                </span>
                                {/* Test/Quick Accept button for Driver testing */}
                                <button 
                                  onClick={() => handleDriverAcceptOrder(order.id)}
                                  className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-md transition shadow"
                                >
                                  Accept Order 🛵
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-2 font-medium flex items-center gap-1.5">
                          <Calendar size={12} className="text-gray-400" />
                          {formatDate(order.orderDate)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ================= PROGRESS BAR ================= */}
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    {isCancelled ? (
                      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex flex-col items-center justify-center gap-1.5 font-bold border border-red-100 dark:border-red-800/30 text-center">
                        <div className="flex items-center gap-2"><X size={20} /> Order Cancelled</div>
                        <p className="text-xs font-medium text-red-500 dark:text-red-300 mt-1 bg-red-100/50 dark:bg-red-900/40 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800/40">
                          Reason: {order.cancellationReason || "Auto-Cancelled (No partner found)"}
                        </p>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute top-1/2 left-0 w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full -translate-y-1/2"></div>
                        <div className={`absolute top-1/2 left-0 h-1.5 bg-green-500 rounded-full -translate-y-1/2 transition-all duration-500`} style={{ width: `${((currentIndex - 1) / 3) * 100}%` }}></div>
                        
                        <div className="relative flex justify-between">
                          {steps.map((step, idx) => {
                            const stepNum = idx + 1;
                            const isActive = stepNum <= currentIndex;
                            const isCurrent = stepNum === currentIndex;
                            
                            return (
                              <div key={step} className="flex flex-col items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 transition-colors duration-300 border-4 border-white dark:border-[#121212] ${isActive ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'} ${isCurrent ? 'ring-4 ring-green-100 dark:ring-green-900/50' : ''}`}>
                                  {stepNum === 1 && <Clock size={14} className={isActive ? "animate-pulse" : ""} />}
                                  {stepNum === 2 && <Store size={14} />}
                                  {stepNum === 3 && (isPickup ? <Store size={14} /> : <Bike size={14} className={isCurrent ? "animate-bounce" : ""} />)}
                                  {stepNum === 4 && <CheckCircle size={14} />}
                                </div>
                                <span className={`text-[10px] sm:text-xs font-bold mt-2 text-center max-w-[60px] leading-tight ${isActive ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'}`}>{step}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ================= LIVE DASHBOARD (ETA + MAP + DRIVER) ================= */}
                  {showLiveMap && (
                    <div className="px-5 pb-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#181818]/50">
                      
                      <div className="mt-4 mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                          <h3 className="text-xl font-extrabold text-green-700 dark:text-green-400">
                            {order.driverLocation ? `${liveETA} mins` : "Locating..."}
                          </h3>
                          <p className="text-xs font-bold text-green-600/80 dark:text-green-400/80 uppercase tracking-wider">Estimated Arrival</p>
                        </div>
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-800/40 rounded-full flex items-center justify-center">
                          <Clock className="text-green-600 dark:text-green-400" size={20} />
                        </div>
                      </div>

                      <LiveTrackingMap 
                        orderId={order.id} 
                        initialLat={order.customerDetails?.lat || 26.548382} 
                        initialLng={order.customerDetails?.lng || 80.478238} 
                      />

                      <div className="mt-4 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
                            <img src={driver.photoUrl} alt="Driver" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base">{driver.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] sm:text-xs px-2 py-0.5 rounded font-mono border border-gray-200 dark:border-gray-700">
                                {driver.vehicleNumber}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {driver.phone && (
                          <a href={`tel:${driver.phone}`} className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow-md shrink-0">
                            <PhoneCall size={18} fill="currentColor" />
                          </a>
                        )}
                      </div>

                    </div>
                  )}

                  {/* ================= CONFIRMATION BOX ================= */}
                  {needsConfirmation && (
                    <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-2xl shadow-md flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-green-200">Action Required</p>
                        <p className="text-sm font-extrabold">{isPickup ? "Is your order ready for pickup?" : "Have you received your package?"}</p>
                      </div>
                      <button 
                        onClick={() => handleConfirmReceipt(order.id, isPickup ? "Pickup" : "Delivery")}
                        className="w-full sm:w-auto bg-white text-green-800 hover:bg-green-50 px-5 py-2.5 rounded-xl text-xs font-extrabold shadow transition flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <CheckCircle2 size={16} className="text-green-600" />
                        {isPickup ? "Confirm Picked Up ✅" : "Confirm Received ✅"}
                      </button>
                    </div>
                  )}

                  {/* ================= ITEMS & INVOICE ================= */}
                  <div className="p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Order Summary</p>
                    <div className="space-y-3">
                      {order.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-start text-sm">
                          <div className="flex gap-3">
                            <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 shrink-0">
                              {item.cartQuantity}x
                            </div>
                            <span className="font-semibold text-gray-700 dark:text-gray-200 pt-0.5">{item.name}</span>
                          </div>
                          <span className="text-gray-600 dark:text-gray-400 font-bold pt-0.5">₹{item.price * item.cartQuantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-800 border-dashed my-4"></div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-gray-500 dark:text-gray-400 font-medium"><span>Item Total</span><span>₹{order.cartTotal || order.totalAmount}</span></div>
                      {order.deliveryFee !== undefined && (<div className="flex justify-between text-gray-500 dark:text-gray-400 font-medium"><span>Delivery Fee</span><span>{order.deliveryFee === 0 ? "FREE" : `₹${order.deliveryFee}`}</span></div>)}
                      {order.discount > 0 && (<div className="flex justify-between text-green-600 dark:text-green-500 font-bold"><span>Discount</span><span>-₹{order.discount}</span></div>)}
                    </div>
                    
                    <div className="border-t border-gray-200 dark:border-gray-800 my-4"></div>

                    <div className="flex justify-between items-center pt-1">
                      <span className="font-black text-lg text-gray-900 dark:text-white">Grand Total</span>
                      <span className="font-black text-xl text-green-600 dark:text-green-500">₹{order.totalAmount}</span>
                    </div>

                    {/* Dynamic Payment Method Tag */}
                    {(() => {
                      const paymentMethod = order.customerDetails?.paymentMethod || order.paymentMethod || "Online";
                      const isCOD = paymentMethod.toLowerCase().includes("cash") || paymentMethod === "COD";

                      return isCOD ? (
                        <div className="mt-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 flex items-center gap-2 border border-orange-200 dark:border-orange-800/30 inline-flex">
                          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                          <span className="text-[10px] sm:text-xs text-orange-700 dark:text-orange-400 font-bold tracking-wide uppercase">
                            To Pay: Cash on Delivery
                          </span>
                        </div>
                      ) : (
                        <div className="mt-4 bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3 flex items-center gap-2 border border-gray-200 dark:border-gray-700/50 inline-flex">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-300 font-bold tracking-wide uppercase">
                            Paid via Online Mode
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* ================= ORDER AGAIN ================= */}
                  <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex justify-end bg-gray-50/50 dark:bg-[#1a1a1a]/30">
                    <button 
                      onClick={() => handleOrderAgain(order.items, order.id)}
                      disabled={orderingId === order.id}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-sm rounded-xl border border-blue-200 dark:border-blue-800/40 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {orderingId === order.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                          Checking Stock...
                        </>
                      ) : (
                        <>
                          <RotateCcw size={16} />
                          Order Again
                        </>
                      )}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}