"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Package, Clock, CheckCircle, Bike, Store, ArrowLeft, ChevronRight, Tag, Truck, X, CheckCircle2, RotateCcw, AlertTriangle } from "lucide-react";
import { useCart } from "@/context/CartContext";

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
    playTone(523.25, 'sine', 0, 0.4);    // C5
    playTone(659.25, 'sine', 0.1, 0.5);  // E5
    playTone(783.99, 'sine', 0.2, 0.6);  // G5
  } catch (e) { console.error(e); }
};

// Soft Error/Alert Sound (For Out of Stock)
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
    playTone(349.23, 'triangle', 0, 0.4);    // F4
    playTone(311.13, 'triangle', 0.15, 0.5); // Eb4
  } catch (e) { console.error(e); }
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderingId, setOrderingId] = useState<string | null>(null);
  
  // Custom UI Toast Notification State (Replaces ugly browser alerts)
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

  // Robust Live-Stock Checked Order Again Function with Toast UI
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
      
      {/* ================= MODERN UI TOAST NOTIFICATION BANNER ================= */}
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
              const isCancelled = order.status === "Cancelled";
              const currentIndex = getStatusIndex(order.status, isPickup);
              
              const steps = isPickup 
                ? ["Pending", "Accepted", "Ready", "Picked Up"]
                : ["Pending", "Accepted", "On the Way", "Delivered"];

              const needsConfirmation = (order.status === "Awaiting Confirmation" || order.status === "Awaiting Pickup Confirmation");

              return (
                <div key={order.id} className="bg-white dark:bg-[#121212] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
                  
                  <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start bg-gray-50/50 dark:bg-[#1e1e1e]/50">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Order ID</p>
                      <h3 className="font-black text-gray-900 dark:text-white text-lg">{order.orderId || "OLD-ORDER"}</h3>
                      <p className="text-xs text-gray-500 mt-1 font-medium">{order.orderDate?.toDate ? order.orderDate.toDate().toLocaleString('en-IN') : 'Just now'}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border flex items-center gap-1 ${isPickup ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50'}`}>
                        {isPickup ? <Store size={12}/> : <Truck size={12}/>} {isPickup ? 'PICKUP' : 'DELIVERY'}
                      </span>
                    </div>
                  </div>

                  {/* ================= LIVE TRACKING PROGRESS BAR ================= */}
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                    {isCancelled ? (
                      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex flex-col items-center justify-center gap-1.5 font-bold border border-red-100 dark:border-red-800/30 text-center">
                        <div className="flex items-center gap-2">
                          <X size={20} /> Order Cancelled
                        </div>
                        {order.cancellationReason && (
                          <p className="text-xs font-medium text-red-500 dark:text-red-300 mt-1 bg-red-100/50 dark:bg-red-900/40 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800/40">
                            Reason: {order.cancellationReason}
                          </p>
                        )}
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
                                <span className={`text-[10px] sm:text-xs font-bold mt-2 ${isActive ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'}`}>{step}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ================= CUSTOMER RECEIPT CONFIRMATION BOX ================= */}
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

                  <div className="p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Items Ordered</p>
                    <div className="space-y-2">
                      {order.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="bg-gray-100 dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-300 font-bold px-2 py-0.5 rounded text-xs">{item.cartQuantity}x</span>
                            <span className="font-semibold text-gray-700 dark:text-gray-200">{item.name}</span>
                          </div>
                          <span className="text-gray-500 dark:text-gray-400 font-medium">₹{item.price * item.cartQuantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-1.5 text-sm">
                      <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Item Total</span><span>₹{order.cartTotal || order.totalAmount}</span></div>
                      
                      {order.deliveryFee !== undefined && (
                        <div className="flex justify-between text-gray-500 dark:text-gray-400">
                          <span>Delivery Fee</span>
                          <span>{order.deliveryFee === 0 ? "FREE" : `₹${order.deliveryFee}`}</span>
                        </div>
                      )}
                      {order.discount > 0 && (
                        <div className="flex justify-between text-green-600 dark:text-green-500 font-bold">
                          <span>Discount ({order.promoCodeUsed})</span>
                          <span>-₹{order.discount}</span>
                        </div>
                      )}
                      
                      <div className="flex justify-between font-black text-lg text-gray-900 dark:text-white pt-2">
                        <span>Total Paid</span>
                        <span className="text-green-600">₹{order.totalAmount}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* ================= ORDER AGAIN BUTTON ================= */}
                  <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex justify-end">
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