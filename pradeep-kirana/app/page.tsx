"use client";

import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, query, where, doc, getDoc, updateDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { useCart } from "@/context/CartContext"; 
import { useWishlist } from "@/context/WishlistContext";
import { Plus, Minus, MapPin, Store, ChevronRight, Search, X, UserCircle, Package, BellRing, Phone, MessageCircle, ExternalLink, Home, Star, AlertTriangle, CheckCircle2, Heart, ShoppingBag, Trash2, MessageSquare, Tag } from "lucide-react";
import { useRouter } from "next/navigation";

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(523.25, 0, 0.2);
    playTone(659.25, 0.15, 0.2);
    playTone(783.99, 0.3, 0.4);
  } catch (e) { console.error(e); }
};

const playCancellationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(440, 0, 0.2);
    playTone(330, 0.15, 0.3);
  } catch (e) { console.error(e); }
};

const formatTimeAmPm = (timeStr: string) => {
  if (!timeStr) return "";
  let [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
};

export default function BlinkitStyleStorefront() {
  const router = useRouter();
  
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortBy, setSortBy] = useState("default");
  const [user, setUser] = useState<any>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' | 'info' }>({ show: false, message: "", type: 'info' });
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean, title: string, onConfirm: () => void } | null>(null);
  
  const [storeStatus, setStoreStatus] = useState({ deliveryPaused: false, storePaused: false, autoTimeEnabled: false, openTime: "09:00", closeTime: "21:00" });
  const [isStoreOpen, setIsStoreOpen] = useState(true);

  const [deliveryConfig, setDeliveryConfig] = useState({ baseFee: 10, freeAbove: 100 });
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [ratingVal, setRatingVal] = useState<number>(0);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  const [notification, setNotification] = useState<{ show: boolean, message: string }>({ show: false, message: "" });
  const prevStatusesRef = useRef<{ [key: string]: string }>({});
  const isFirstLoad = useRef(true);
  
  const { cart, addToCart, removeFromCart, cartTotal, cartCount, isCartOpen, setIsCartOpen, cartNotice, setCartNotice } = useCart() as any;
  const { toggleWishlist, isInWishlist } = useWishlist() as any;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3500);
  };

  const handleRemoveEntireItem = (item: any) => {
    for (let i = 0; i < item.cartQuantity; i++) {
      removeFromCart(item.id);
    }
  };

  const handleClearCartClick = () => {
    setConfirmDialog({
      show: true,
      title: "Are you sure you want to clear your cart?",
      onConfirm: () => {
        cart.forEach((item: any) => {
          for (let i = 0; i < item.cartQuantity; i++) {
            removeFromCart(item.id);
          }
        });
        setIsCartOpen(false);
        setConfirmDialog(null);
        showToast("Cart cleared successfully.", "info");
      }
    });
  };

  useEffect(() => {
    const checkStatus = () => {
      if (storeStatus.storePaused) {
        setIsStoreOpen(false);
        return;
      }
      if (storeStatus.autoTimeEnabled && storeStatus.openTime && storeStatus.closeTime) {
        const now = new Date();
        const current = now.getHours() * 60 + now.getMinutes();
        const [oh, om] = storeStatus.openTime.split(':').map(Number);
        const [ch, cm] = storeStatus.closeTime.split(':').map(Number);
        const open = oh * 60 + om;
        const close = ch * 60 + cm;
        
        if (close < open) setIsStoreOpen(current >= open || current <= close);
        else setIsStoreOpen(current >= open && current <= close);
      } else {
        setIsStoreOpen(true);
      }
    };
    
    checkStatus();
    const timer = setInterval(checkStatus, 30000); 
    return () => clearInterval(timer);
  }, [storeStatus]);

  useEffect(() => {
    let unsubOrders = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const hasPhoneLinked = currentUser.providerData.some((p) => p.providerId === "phone") || !!currentUser.phoneNumber;
        
        if (!hasPhoneLinked) {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          const isAdmin = userDoc.exists() && userDoc.data().role === "admin";
          
          if (!isAdmin) {
            await signOut(auth);
            setUser(null);
            setCustomerOrders([]);
            if (unsubOrders) unsubOrders();
            return;
          }
        }

        setUser(currentUser);
        
        const qOrders = query(collection(db, "orders"), where("customerId", "==", currentUser.uid));
        unsubOrders = onSnapshot(qOrders, (snapshot) => {
          const newStatuses: { [key: string]: string } = {};
          const ordersList: any[] = [];
          let notifyMsg = "";
          let shouldSound = false;
          let isCancelled = false;

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const orderId = docSnap.id;
            const currentStatus = data.status;
            newStatuses[orderId] = currentStatus;
            
            ordersList.push({ id: orderId, ...data });

            if (!isFirstLoad.current) {
              const prevStatus = prevStatusesRef.current[orderId];
              if (prevStatus && prevStatus !== currentStatus) {
                shouldSound = true;
                if (currentStatus === "Delivered" || currentStatus === "Picked Up") {
                  notifyMsg = `🎉 Order ${data.orderId || orderId.slice(0, 6)} is now completed!`;
                } else if (currentStatus === "Awaiting Confirmation" || currentStatus === "Awaiting Pickup Confirmation") {
                  notifyMsg = `📦 Order ${data.orderId || orderId.slice(0, 6)} is ready for your confirmation!`;
                } else if (currentStatus === "Accepted") {
                  notifyMsg = `✅ Order ${data.orderId || orderId.slice(0, 6)} has been Accepted by store!`;
                } else if (currentStatus === "Cancelled") {
                  isCancelled = true;
                  notifyMsg = `❌ Order ${data.orderId || orderId.slice(0, 6)} has been Cancelled!`;
                }
              }
            }
          });

          setCustomerOrders(ordersList);

          if (shouldSound && notifyMsg) {
            if (isCancelled) playCancellationSound();
            else playNotificationSound();
            setNotification({ show: true, message: notifyMsg });
            setTimeout(() => setNotification({ show: false, message: "" }), 6000);
          }
          prevStatusesRef.current = newStatuses;
          if (isFirstLoad.current) isFirstLoad.current = false;
        });
      } else {
        setUser(null);
        setCustomerOrders([]);
        if (unsubOrders) unsubOrders();
      }
    });

    const q = query(collection(db, "items"), where("isAvailable", "==", true));
    const unsubscribeDb = onSnapshot(q, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
      setProducts(items);
      setSelectedProduct((prev: any) => prev ? items.find((p) => p.id === prev.id) || prev : null);
      setLoading(false);
    });
    
    const unsubStoreStatus = onSnapshot(doc(db, "settings", "storeStatus"), (docSnap) => {
      if (docSnap.exists()) setStoreStatus(docSnap.data() as any);
    });

    const unsubDeliveryConfig = onSnapshot(doc(db, "settings", "deliveryConfig"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setDeliveryConfig({
          baseFee: Number(data.baseFee) || 10,
          freeAbove: Number(data.freeAbove) || 100
        });
      }
    });

    return () => { 
      unsubscribeAuth(); 
      unsubscribeDb(); 
      unsubStoreStatus(); 
      unsubDeliveryConfig(); 
      if (unsubOrders) unsubOrders();
    };
  }, []);

  const handleConfirmReceipt = async (orderId: string, orderType: string) => {
    const newStatus = orderType === "Pickup" ? "Picked Up" : "Delivered";
    try {
      playNotificationSound();
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus,
        customerConfirmedAt: new Date()
      });
      showToast(`Thank you! Order marked as ${newStatus} successfully 🎉`, "success");
    } catch (error) {
      console.error("Error updating status:", error);
      showToast("Failed to update status. Please try again.", "error");
    }
  };

  useEffect(() => {
    if (selectedProduct && user) {
      const checkExistingReview = async () => {
        try {
          const reviewRef = doc(db, "reviews", `${selectedProduct.id}_${user.uid}`);
          const reviewSnap = await getDoc(reviewRef);
          if (reviewSnap.exists()) {
            setHasReviewed(true);
            setRatingVal(reviewSnap.data().rating);
            setReviewText(reviewSnap.data().reviewText || "");
          } else {
            setHasReviewed(false);
            setRatingVal(0);
            setReviewText("");
          }
        } catch (e) {
          console.error("Error fetching review", e);
        }
      };
      checkExistingReview();
    } else {
      setHasReviewed(false);
      setRatingVal(0);
      setReviewText("");
    }
  }, [selectedProduct, user]);

  const submitReview = async () => {
    if (!user || !auth.currentUser) { 
      showToast("Please login first to write a review! ⭐", "error"); 
      router.push('/login'); 
      return; 
    }
    if (ratingVal === 0) { 
      showToast("Please select a star rating first!", "error"); 
      return; 
    }

    setIsSubmittingReview(true);
    try {
      const idToken = await auth.currentUser.getIdToken(true);

      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          productId: selectedProduct.id,
          ratingVal: ratingVal,
          reviewText: reviewText
        })
      });

      const data = await response.json();

      if (data.success) {
        showToast("Review submitted successfully! Thanks for your feedback 🎉", "success");
        setHasReviewed(true);
      } else {
        showToast(`Failed: ${data.error}`, "error");
      }
    } catch (error) {
      console.error("Review error:", error);
      showToast("Failed to submit review. Please try again.", "error");
    }
    setIsSubmittingReview(false);
  };

  const dynamicCategories = ["All", ...Array.from(new Set(products.map(p => p.category)))];
  
  let filteredProducts = activeCategory === "All" ? products : products.filter(p => p.category === activeCategory);
  if (searchQuery) {
    filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  if (sortBy === "low-high") {
    filteredProducts.sort((a, b) => a.price - b.price);
  } else if (sortBy === "high-low") {
    filteredProducts.sort((a, b) => b.price - a.price);
  } else if (sortBy === "rating") {
    filteredProducts.sort((a, b) => (b.ratingSum / (b.ratingCount || 1)) - (a.ratingSum / (a.ratingCount || 1)));
  }

  const topRatedProducts = [...products]
    .filter(p => (p.ratingCount || 0) > 0)
    .sort((a, b) => (b.ratingSum / b.ratingCount) - (a.ratingSum / a.ratingCount))
    .slice(0, 5);

  const currentDeliveryFee = cartTotal < deliveryConfig.freeAbove ? deliveryConfig.baseFee : 0;
  const finalCartTotalWithDelivery = cartTotal + currentDeliveryFee;

  const activeOrdersNeedingConfirmation = customerOrders.filter(
    (order) => order.status === "Awaiting Confirmation" || order.status === "Awaiting Pickup Confirmation"
  );

  return (
    <div className="min-h-screen pb-32 font-sans relative selection:bg-green-200 dark:selection:bg-green-900/50 bg-gray-50/50 dark:bg-[#0a0a0a] transition-colors duration-300">
      
      {/* CUSTOM TOAST NOTIFICATION */}
      {(toast.show || cartNotice) && (
        <div className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 max-w-md p-4 rounded-2xl shadow-2xl flex items-center justify-between border backdrop-blur-md animate-in slide-in-from-top-5 duration-300 ${
          (cartNotice || toast.type === 'error') ? 'bg-red-600/95 text-white border-red-400 shadow-red-900/20' 
          : toast.type === 'success' ? 'bg-green-600/95 text-white border-green-400 shadow-green-900/20'
          : 'bg-blue-600/95 text-white border-blue-400 shadow-blue-900/20'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full shrink-0">
              {(cartNotice || toast.type === 'error') ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Notification</p>
              <p className="text-sm font-extrabold leading-tight">{cartNotice || toast.message}</p>
            </div>
          </div>
          <button onClick={() => { setToast(prev => ({ ...prev, show: false })); if(setCartNotice) setCartNotice(null); }} className="p-1 hover:bg-black/20 rounded-full transition shrink-0"><X size={18} /></button>
        </div>
      )}

      {/* CUSTOM CONFIRMATION DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white dark:bg-[#121212] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Trash2 size={28} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-[#1e1e1e] dark:hover:bg-[#2a2a2a] text-gray-800 dark:text-gray-200 font-bold py-3 rounded-2xl transition active:scale-95">Cancel</button>
              <button onClick={confirmDialog.onConfirm} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl transition shadow-md active:scale-95">Yes, Clear</button>
            </div>
          </div>
        </div>
      )}

      {notification.show && (
        <div onClick={() => router.push('/orders')} className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[90] w-11/12 max-w-lg bg-green-600/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl cursor-pointer flex items-center justify-between border-2 border-green-400 animate-in slide-in-from-top-5 duration-300 hover:bg-green-700 transition">
          <div className="flex items-center gap-3"><div className="p-2 bg-white/20 rounded-full animate-bounce"><BellRing size={20} /></div><div><p className="text-xs font-bold uppercase tracking-wider text-green-200">Order Update</p><p className="text-sm font-extrabold">{notification.message}</p></div></div>
          <button onClick={(e) => { e.stopPropagation(); setNotification({ show: false, message: "" }); }} className="p-1 hover:bg-black/20 rounded-full transition"><X size={18} /></button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/80 dark:bg-[#121212]/80 backdrop-blur-xl p-3 sm:p-4 shadow-sm border-b dark:border-gray-800/80 sticky top-0 z-45 transition-colors duration-300">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div className="flex items-center gap-3 hover:opacity-80 transition cursor-pointer group" onClick={() => { setActiveCategory("All"); setSearchQuery(""); }}>
              {/* 🟢 LARGER STORE ICON (Border removed) 🟢 */}
              <img src="/store-icon.png" alt="Pradeep Kirana" className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-lg object-cover transition-transform duration-300 group-hover:scale-105 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-gray-900 dark:text-white leading-tight group-hover:text-green-600 dark:group-hover:text-green-500 transition-colors">Pradeep Kirana</h1>
                <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">Genuine products, fast delivery in Unnao</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              <button onClick={() => setShowContactModal(true)} className="bg-gray-100 dark:bg-[#1e1e1e] hover:bg-gray-200 dark:hover:bg-[#2a2a2a] text-gray-800 dark:text-gray-200 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-gray-200 dark:border-gray-700/80 shadow-sm active:scale-95"><Phone size={14} className="text-blue-500" /> Contact</button>
              {user ? (
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#1a1a1a] p-1 pr-3 rounded-full border border-gray-200 dark:border-gray-800 shadow-sm">
                  <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border-2 border-green-500 object-cover shadow-sm" />
                  <div className="text-left"><p className="text-xs font-bold leading-tight text-gray-900 dark:text-white">{user.displayName?.split(" ")[0]}</p><button onClick={() => { signOut(auth); showToast("Logged out successfully.", "info"); }} className="text-[10px] text-red-500 font-bold hover:underline transition">Logout</button></div>
                </div>
              ) : (
                <button onClick={() => router.push('/login')} className="flex items-center gap-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold shadow-md hover:scale-105 transition transform active:scale-95"><UserCircle size={16} /> Login</button>
              )}
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute left-3.5 top-3.5 text-gray-400 group-focus-within:text-green-500 transition-colors" size={18} />
            <input type="text" placeholder='Search "Aashirvaad Atta", "Dal", "Rice"...' value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-100 dark:bg-[#1e1e1e] text-gray-900 dark:text-white border border-transparent dark:border-gray-800 rounded-2xl py-3 pl-10 pr-4 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white dark:focus:bg-[#151515] transition-all shadow-sm" />
          </div>
        </div>
      </header>

      {/* STORE CLOSED BANNER */}
      {!isStoreOpen && (
        <div className="bg-red-100/90 backdrop-blur-md dark:bg-red-900/40 border-b border-red-200 dark:border-red-800/50 px-4 py-3 flex items-center justify-center gap-2 z-30 shadow-sm animate-in slide-in-from-top-2">
          <Store size={18} className="text-red-600 dark:text-red-400 shrink-0 animate-pulse" />
          <p className="text-xs sm:text-sm font-bold text-red-800 dark:text-red-300 text-center">
            Store is currently closed. We are not accepting orders right now.
            {storeStatus.autoTimeEnabled && storeStatus.openTime && (
              <span className="block sm:inline sm:ml-1">
                (Opens at {formatTimeAmPm(storeStatus.openTime)})
              </span>
            )}
          </p>
        </div>
      )}

      {/* DELIVERY PAUSED BANNER */}
      {isStoreOpen && storeStatus.deliveryPaused && (
        <div className="bg-orange-100/90 backdrop-blur-md dark:bg-orange-900/40 border-b border-orange-200 dark:border-orange-800/50 px-4 py-2.5 flex items-center justify-center gap-2 z-30 shadow-sm animate-in slide-in-from-top-2">
          <AlertTriangle size={18} className="text-orange-600 dark:text-orange-400 shrink-0" />
          <p className="text-xs sm:text-sm font-bold text-orange-800 dark:text-orange-300 text-center">
            Home Delivery is temporarily paused. <span className="underline decoration-2">Only Store Pickup is available.</span>
          </p>
        </div>
      )}

      {/* ACTIVE ORDERS & CONFIRMATION BANNER */}
      {user && activeOrdersNeedingConfirmation.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-6">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 sm:p-5 rounded-3xl shadow-xl border border-green-500 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="animate-bounce" size={22} />
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wide">Confirm Package Receipt</h3>
              </div>
              <span className="bg-white/20 text-xs px-3 py-1 rounded-full font-extrabold">{activeOrdersNeedingConfirmation.length} Pending</span>
            </div>

            <div className="space-y-2.5">
              {activeOrdersNeedingConfirmation.map((order) => {
                const isPickup = order.deliveryType === "Pickup" || order.customerDetails?.orderType === "Pickup";
                return (
                  <div key={order.id} className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition hover:bg-white/20">
                    <div>
                      <p className="text-xs font-bold text-green-200">Order ID: #{order.orderId || order.id.slice(0, 6)}</p>
                      <p className="text-sm font-extrabold">Status: <span className="text-yellow-300">Delivered / Ready - Please Confirm</span></p>
                      <p className="text-[11px] text-gray-200 mt-0.5">Total Amount: ₹{order.totalAmount}</p>
                    </div>
                    <button 
                      onClick={() => handleConfirmReceipt(order.id, isPickup ? "Pickup" : "Delivery")}
                      className="w-full sm:w-auto bg-white text-green-800 hover:bg-green-50 px-5 py-2.5 rounded-xl text-xs font-black shadow-lg transition active:scale-95 transform flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 size={16} className="text-green-600" />
                      {isPickup ? "Confirm Picked Up ✅" : "Confirm Received ✅"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TOP RATED SECTION */}
      {!searchQuery && topRatedProducts.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>⭐</span> Top Rated Essentials
            </h2>
          </div>
          <div className="flex gap-3.5 overflow-x-auto pb-4 pt-2 -mt-2 scrollbar-hide px-1">
            {topRatedProducts.map(product => {
              const rCount = product.ratingCount || 1;
              const avg = (product.ratingSum / rCount).toFixed(1);
              return (
                <div key={product.id} onClick={() => setSelectedProduct(product)} className="min-w-[150px] max-w-[150px] bg-white dark:bg-[#161616] rounded-2xl p-3 border border-gray-100 dark:border-gray-800 shadow-sm cursor-pointer flex-shrink-0 hover:border-green-500/50 hover:-translate-y-1.5 hover:shadow-xl transition-all duration-300 group">
                  <div className="h-28 bg-gray-50 dark:bg-[#1e1e1e] rounded-xl overflow-hidden mb-2.5 relative flex items-center justify-center">
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : <span className="text-green-600 font-bold text-2xl group-hover:scale-110 transition-transform duration-300">{product.name.charAt(0)}</span>}
                    <span className="absolute bottom-1.5 right-1.5 bg-yellow-400 text-black text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-md">
                      {avg} <Star size={9} className="fill-current" />
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 line-clamp-1 group-hover:text-green-600 transition-colors">{product.name}</h4>
                  <p className="text-xs font-black text-green-600 dark:text-green-500 mt-1">₹{product.price}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MAIN CONTAINER WITH RESPONSIVE CATEGORIES LAYOUT */}
      <main className="max-w-4xl mx-auto flex flex-col md:flex-row gap-6 p-4 mt-2">
        {/* CATEGORIES SIDEBAR / HORIZONTAL PILLS BAR */}
        <div className="md:w-1/4 w-full flex md:flex-col flex-row overflow-x-auto md:overflow-visible gap-2.5 pb-2 md:pb-0 scrollbar-hide shrink-0">
          {dynamicCategories.map((cat: any) => (
            <button 
              key={cat} 
              onClick={() => setActiveCategory(cat)} 
              className={`flex-shrink-0 text-left px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 border shadow-sm active:scale-95 whitespace-nowrap ${
                activeCategory === cat 
                  ? "bg-green-600 text-white border-green-600 shadow-green-900/20 shadow-lg scale-[1.02]" 
                  : "bg-white dark:bg-[#161616] text-gray-600 dark:text-gray-300 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-[#202020]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* PRODUCTS GRID SECTION */}
        <div className="md:w-3/4 w-full">
          <div className="flex justify-between items-center mb-4 px-1 animate-in fade-in duration-300">
            <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              {activeCategory === "All" ? "All Groceries & Essentials" : activeCategory}
            </h2>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)} 
              className="bg-white dark:bg-[#161616] text-gray-700 dark:text-gray-300 text-xs font-bold border border-gray-200 dark:border-gray-800 rounded-xl px-3.5 py-2.5 outline-none shadow-sm cursor-pointer hover:border-gray-300 transition-colors focus:ring-2 focus:ring-green-500"
            >
              <option value="default">Sort By: Featured</option>
              <option value="low-high">Price: Low to High</option>
              <option value="high-low">Price: High to Low</option>
              <option value="rating">Highest Rated ⭐</option>
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-pulse">{[1,2,3,4,5,6].map(n => <div key={n} className="h-60 bg-gray-200 dark:bg-[#1e1e1e] rounded-3xl"></div>)}</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center text-gray-500 mt-10 p-12 bg-white dark:bg-[#161616] rounded-3xl border border-dashed border-gray-300 dark:border-gray-800 shadow-sm animate-in fade-in duration-300">
              <Package size={52} className="mx-auto mb-4 opacity-30 animate-bounce" />
              <p className="font-extrabold text-base">{searchQuery ? "No products found matching your search." : "Store has no items currently!"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const inCart = cart.find((item: any) => item.id === product.id)?.cartQuantity || 0;
                const isOutOfStock = product.stockQuantity <= 0;
                const rCount = product.ratingCount || 0;
                const avgRating = rCount > 0 ? (product.ratingSum / rCount).toFixed(1) : "New";
                const isSaved = isInWishlist(product.id);

                return (
                  <div key={product.id} className="group bg-white dark:bg-[#161616] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800/80 overflow-hidden flex flex-col relative transition-all duration-300 hover:shadow-2xl hover:-translate-y-1.5 hover:border-green-500/40">
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleWishlist(product); }} 
                      className="absolute top-3 right-3 z-20 p-2.5 bg-white/90 dark:bg-black/60 backdrop-blur-md rounded-full shadow-md transition-transform active:scale-90 hover:scale-110"
                    >
                      <Heart size={16} className={isSaved ? "fill-red-500 text-red-500" : "text-gray-500 dark:text-gray-300"} />
                    </button>

                    <div onClick={() => setSelectedProduct(product)} className="h-40 bg-gray-50 dark:bg-[#1c1c1c] flex items-center justify-center overflow-hidden border-b border-gray-100 dark:border-gray-800/60 relative cursor-pointer">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" /> : <span className="text-green-800 dark:text-green-500 font-black text-4xl uppercase group-hover:scale-110 transition-transform duration-500">{product.name.charAt(0)}</span>}
                      {isOutOfStock && <div className="absolute inset-0 bg-white/70 dark:bg-black/70 flex items-center justify-center z-10 backdrop-blur-md"><span className="bg-red-600 text-white px-3 py-1 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg">Out of Stock</span></div>}
                    </div>
                    
                    <div className="p-4 flex flex-col flex-grow">
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 mb-1.5">
                        <div className={`flex items-center px-2 py-0.5 rounded-md font-extrabold ${rCount > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-100 dark:border-green-800/50' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {avgRating} {rCount > 0 && <Star size={10} className="fill-current ml-0.5" />}
                        </div>
                        <span className="font-semibold">({rCount > 0 ? rCount : 'No'} reviews)</span>
                      </div>

                      <h3 onClick={() => setSelectedProduct(product)} className="text-sm font-black text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight mb-1 cursor-pointer group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">{product.name}</h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 font-bold">{product.unit}</p>
                      
                      <div className="mt-auto flex items-center justify-between">
                        <span className="font-black text-base text-gray-900 dark:text-white">₹{product.price}</span>
                        {!isOutOfStock && (
                          inCart > 0 ? (
                            <div className="flex items-center bg-green-600 dark:bg-green-600 text-white rounded-xl shadow-md z-20 overflow-hidden animate-in zoom-in-95 duration-200">
                              <button onClick={() => removeFromCart(product.id)} className="p-2 hover:bg-green-700 transition-colors active:scale-90"><Minus size={14}/></button>
                              <span className="px-2.5 font-black text-sm w-7 text-center">{inCart}</span>
                              <button onClick={() => addToCart(product)} disabled={inCart >= product.stockQuantity} className="p-2 hover:bg-green-700 transition-colors disabled:opacity-50 active:scale-90"><Plus size={14}/></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(product)} className="border-2 border-green-600 text-green-700 bg-green-50/50 px-4 py-2 rounded-xl text-xs font-black hover:bg-green-600 hover:text-white dark:bg-transparent dark:text-green-400 dark:hover:bg-green-600 transition-all z-20 active:scale-95 shadow-sm">ADD</button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* SMOOTH FLOATING CART BUTTON */}
      <div className="fixed z-40 bottom-[84px] left-0 right-0 pointer-events-none flex justify-center px-4">
        <div className="w-full max-w-4xl flex justify-end md:justify-center">
          <button 
            onClick={() => setIsCartOpen(true)} 
            className={`bg-green-600 dark:bg-green-600 text-white shadow-2xl overflow-hidden flex items-center transition-all duration-300 ease-out hover:bg-green-700 border border-green-400/40 pointer-events-auto active:scale-95 ${
              cartCount > 0 
                ? "w-full rounded-2xl py-3.5 px-6 justify-between animate-in slide-in-from-bottom-4 shadow-green-900/30" 
                : "w-14 h-14 rounded-full justify-center shadow-green-900/30"
            }`}
          >
            {cartCount > 0 ? (
              <div className="flex w-full justify-between items-center whitespace-nowrap">
                <div className="flex flex-col items-start">
                  <span className="text-[11px] uppercase tracking-wider font-extrabold text-green-100 leading-tight">{cartCount} Item{cartCount > 1 ? 's' : ''}</span>
                  <span className="text-base sm:text-lg font-black leading-tight mt-0.5">₹{finalCartTotalWithDelivery.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1 font-black text-sm bg-black/15 px-4 py-2.5 rounded-xl transition hover:bg-black/25">
                  View Cart <ChevronRight size={18} className="text-green-200" />
                </div>
              </div>
            ) : (
              <ShoppingBag size={22} className="text-white shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 w-full bg-white/90 dark:bg-[#121212]/90 backdrop-blur-xl border-t border-gray-200/80 dark:border-gray-800/80 z-50 py-3 px-6 flex justify-between items-center shadow-[0_-10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.5)] pb-[env(safe-area-inset-bottom)]">
        <button onClick={() => router.push('/')} className="flex-1 flex flex-col items-center gap-1 text-green-600 dark:text-green-500 font-black text-[11px] transition active:scale-95"><Home size={22} className="mb-0.5" /><span>Home</span></button>
        <button onClick={() => router.push('/wishlist')} className="flex-1 flex flex-col items-center gap-1 text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-500 font-bold text-[11px] transition active:scale-95"><Heart size={22} className="mb-0.5" /><span>Saved</span></button>
        <button onClick={() => { if (!user) { showToast("Please login first!", "error"); router.push('/login'); } else router.push('/orders'); }} className="flex-1 flex flex-col items-center gap-1 text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-500 font-bold text-[11px] transition active:scale-95"><Package size={22} className="mb-0.5" /><span>Orders</span></button>
        <button onClick={() => { if (!user) { showToast("Please login first!", "error"); router.push('/login'); } else router.push('/reviews'); }} className="flex-1 flex flex-col items-center gap-1 text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-500 font-bold text-[11px] transition active:scale-95"><MessageSquare size={22} className="mb-0.5" /><span>Reviews</span></button>
      </nav>

      {/* ================= SMOOTH SLIDE-IN CART SIDEBAR ================= */}
      <div 
        className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-md transition-all duration-300 ease-in-out ${
          isCartOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsCartOpen(false)}
      />

      <div 
        className={`fixed top-0 right-0 z-[70] w-full max-w-md bg-white dark:bg-[#121212] h-full shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${
          isCartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a1a] flex justify-between items-center z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">Your Cart</h2>
            {cartCount > 0 && (
              <button onClick={handleClearCartClick} className="text-xs text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-xl border border-red-100 dark:border-red-900/50 transition flex items-center gap-1 active:scale-95">
                <Trash2 size={12} /> Clear Cart
              </button>
            )}
          </div>
          <button onClick={() => setIsCartOpen(false)} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] hover:text-gray-900 dark:hover:text-white rounded-full transition active:scale-90"><X size={22} /></button>
        </div>
        
        {!isStoreOpen && (
          <div className="bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-bold text-red-800 dark:text-red-400 border-b border-red-100 dark:border-red-800/50 flex items-center gap-2">
            <Store size={16} className="shrink-0" />
            Store is closed right now. You can keep items in your cart but checkout is disabled.
          </div>
        )}

        {isStoreOpen && storeStatus.deliveryPaused && (
          <div className="bg-orange-50 dark:bg-orange-900/30 p-3.5 text-xs font-bold text-orange-800 dark:text-orange-400 border-b border-orange-100 dark:border-orange-800/50 flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            Note: Delivery is off. You will only be able to place a Store Pickup order.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-gray-50/50 dark:bg-[#0a0a0a]">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="bg-gray-100 dark:bg-[#1a1a1a] p-6 rounded-full mb-4 animate-pulse">
                <ShoppingBag size={52} className="opacity-40" />
              </div>
              <p className="font-extrabold text-base text-gray-500 dark:text-gray-400">Your cart is empty</p>
              <p className="text-xs mt-2 opacity-70">Add items from the store to see them here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center bg-white dark:bg-[#181818] p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center gap-3 w-1/2">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded-xl object-cover border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e]" /> : <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center font-bold">{item.name.charAt(0)}</div>}
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1 leading-tight mb-1">{item.name}</h4>
                      <p className="text-sm font-black text-green-600 dark:text-green-500">₹{item.price}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center bg-gray-50 dark:bg-[#121212] rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                      <button onClick={() => removeFromCart(item.id)} className="p-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] transition active:scale-90"><Minus size={14}/></button>
                      <span className="px-2 font-black text-gray-900 dark:text-white text-sm min-w-[28px] text-center">{item.cartQuantity}</span>
                      <button onClick={() => addToCart(item)} disabled={item.cartQuantity >= item.stockQuantity} className="p-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] transition disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"><Plus size={14}/></button>
                    </div>
                    <button 
                      onClick={() => handleRemoveEntireItem(item)} 
                      className="p-2.5 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition active:scale-90"
                      title="Remove Item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161616] shadow-[0_-10px_20px_rgba(0,0,0,0.03)] z-10">
          <div className="space-y-2 mb-4 text-sm bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex justify-between items-center text-gray-600 dark:text-gray-400 font-medium">
              <span>Item Total</span>
              <span className="font-bold text-gray-900 dark:text-white">₹{cartTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-600 dark:text-gray-400 font-medium">
              <span>Delivery Charges</span>
              <span className="font-bold">
                {cartTotal === 0 ? "₹0.00" : (cartTotal < deliveryConfig.freeAbove ? `₹${deliveryConfig.baseFee}.00` : <span className="text-green-600 dark:text-green-500 font-black uppercase text-[10px] tracking-wider bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded border border-green-200 dark:border-green-800/50">FREE</span>)}
              </span>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-base font-black text-gray-900 dark:text-white">
              <span>Total Amount</span>
              <span className="text-green-600 dark:text-green-500 text-lg">₹{cartTotal === 0 ? "0.00" : finalCartTotalWithDelivery.toFixed(2)}</span>
            </div>
          </div>

          <div className="mb-4 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-3.5 rounded-2xl border border-blue-100 dark:border-blue-800/50 flex items-center gap-2">
            <Tag size={16} className="shrink-0" />
            <span>Apply coupons and promo codes on the checkout page</span>
          </div>

          <button 
            onClick={() => { 
              if (!isStoreOpen || cartCount === 0) return;
              setIsCartOpen(false); 
              if(!user) { showToast("Please login to checkout!", "error"); router.push('/login'); } 
              else router.push('/checkout'); 
            }} 
            disabled={!isStoreOpen || cartCount === 0}
            className={`w-full py-4 rounded-2xl font-black text-lg transition-all active:scale-[0.98] shadow-lg flex justify-center items-center gap-2 ${
              isStoreOpen && cartCount > 0
                ? "bg-green-600 dark:bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-500 shadow-green-900/30" 
                : "bg-gray-300 dark:bg-gray-800 text-gray-500 dark:text-gray-500 cursor-not-allowed shadow-none"
            }`}
          >
            {!isStoreOpen ? "Checkout Disabled (Store Closed)" : (cartCount === 0 ? "Cart is Empty" : <>Proceed to Checkout <ChevronRight size={20} /></>)}
          </button>
        </div>
      </div>
      {/* ========================================================================= */}

      {/* PRODUCT DETAILS MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-300 relative flex flex-col max-h-[90vh]">
            <button onClick={() => { setSelectedProduct(null); setRatingVal(0); setReviewText(""); }} className="absolute top-4 right-4 z-10 p-2.5 bg-white/90 dark:bg-black/60 backdrop-blur-md hover:bg-white dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95"><X size={20} /></button>
            <div className="h-56 sm:h-64 bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-center overflow-hidden shrink-0 relative border-b border-gray-200 dark:border-gray-800">
               {selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover transition-transform duration-700 hover:scale-110" /> : <span className="text-green-800 dark:text-green-500 font-bold text-8xl uppercase">{selectedProduct.name.charAt(0)}</span>}
               {selectedProduct.stockQuantity <= 0 && <div className="absolute inset-0 bg-white/70 dark:bg-black/70 flex items-center justify-center z-10 backdrop-blur-md"><span className="bg-red-600 text-white px-4 py-2 rounded-xl font-black text-sm uppercase tracking-widest shadow-xl transform -rotate-6">Out of Stock</span></div>}
            </div>

            <div className="p-6 overflow-y-auto flex flex-col flex-grow bg-white dark:bg-[#121212]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-black text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800/50 px-2.5 py-1 rounded-md uppercase tracking-wider">{selectedProduct.category}</span>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {(() => {
                    const rCount = selectedProduct.ratingCount || 0;
                    const avg = rCount > 0 ? (selectedProduct.ratingSum / rCount).toFixed(1) : "New";
                    return (
                      <><div className={`flex items-center px-2 py-0.5 rounded-md font-bold ${rCount > 0 ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/30' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>{avg} {rCount > 0 && <Star size={11} className="fill-current ml-1" />}</div><span className="font-bold">({rCount > 0 ? rCount : '0'} reviews)</span></>
                    );
                  })()}
                </div>
              </div>

              <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-1 leading-tight">{selectedProduct.name}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-5 font-bold">{selectedProduct.unit}</p>

              <div className="mb-2 bg-gray-50 dark:bg-[#181818] p-5 rounded-3xl border border-gray-100 dark:border-gray-800">
                {hasReviewed ? (
                  <div className="text-center py-2 animate-in fade-in duration-300">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-3 animate-bounce">
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="text-sm font-extrabold text-gray-900 dark:text-white mb-1">You've reviewed this product!</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-medium">Thanks for sharing your feedback.</p>
                    <button 
                      onClick={() => { setSelectedProduct(null); router.push('/reviews'); }} 
                      className="w-full text-sm font-extrabold text-green-700 dark:text-green-400 bg-white dark:bg-[#222] border border-green-200 dark:border-green-800/50 px-4 py-3 rounded-2xl hover:bg-green-50 dark:hover:bg-green-900/20 transition shadow-sm active:scale-95"
                    >
                      Manage in My Reviews
                    </button>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 text-center">Write a Review</p>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => setRatingVal(star)} onMouseEnter={() => setHoveredStar(star)} onMouseLeave={() => setHoveredStar(null)} className="p-1 hover:scale-125 transition-transform active:scale-95">
                          <Star size={30} className={`transition-all duration-200 ${(hoveredStar ? star <= hoveredStar : star <= ratingVal) ? "fill-yellow-400 text-yellow-400 drop-shadow-md" : "text-gray-300 dark:text-gray-700"}`} />
                        </button>
                      ))}
                    </div>
                    <textarea 
                      value={reviewText} 
                      onChange={(e) => setReviewText(e.target.value)} 
                      placeholder="How was the product? Type your review here..." 
                      className="w-full bg-white dark:bg-[#121212] text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-2xl p-3.5 text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none mb-3 shadow-sm placeholder:text-gray-400" 
                      rows={2}
                    ></textarea>
                    <button onClick={submitReview} disabled={isSubmittingReview || ratingVal === 0} className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 font-black py-3.5 rounded-2xl transition disabled:opacity-50 text-sm shadow-md active:scale-95 flex justify-center items-center gap-2">
                      {isSubmittingReview ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : "Submit Review"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161616] flex items-center justify-between z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
               <span className="text-3xl font-black text-gray-900 dark:text-white">₹{selectedProduct.price}</span>
               {(() => {
                 const inCart = cart.find((item: any) => item.id === selectedProduct.id)?.cartQuantity || 0;
                 if (selectedProduct.stockQuantity <= 0) return <span className="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-5 py-2.5 rounded-xl font-black border border-red-200 dark:border-red-800/50 text-sm uppercase tracking-wide">Out of Stock</span>;
                 if (inCart > 0) return (
                  <div className="flex items-center bg-green-600 dark:bg-green-600 text-white rounded-2xl shadow-xl animate-in zoom-in-95 duration-200">
                    <button onClick={() => removeFromCart(selectedProduct.id)} className="p-3.5 hover:bg-green-700 rounded-l-2xl transition active:scale-90"><Minus size={20}/></button>
                    <span className="px-5 font-black text-lg w-8 text-center">{inCart}</span>
                    <button onClick={() => addToCart(selectedProduct)} disabled={inCart >= selectedProduct.stockQuantity} className="p-3.5 hover:bg-green-700 rounded-r-2xl disabled:opacity-50 transition active:scale-90"><Plus size={20}/></button>
                  </div>
                 );
                 return <button onClick={() => addToCart(selectedProduct)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-2xl font-black flex items-center gap-2 transform active:scale-95 transition shadow-lg text-sm tracking-wide">ADD TO CART</button>;
               })()}
            </div>
          </div>
        </div>
      )}

      {/* CONTACT MODAL */}
      {showContactModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-300">
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a1a] flex justify-between items-center shadow-sm">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2"><Store className="text-green-600" size={20} /> Pradeep Kirana</h3>
              <button onClick={() => setShowContactModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] rounded-full text-gray-500 dark:text-gray-400 transition active:scale-90"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3.5 bg-gray-50 dark:bg-[#181818] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 transition hover:shadow-md">
                <MapPin className="text-red-500 shrink-0 mt-1" size={22} />
                <div className="flex-1">
                  <p className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Store Address</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-1 leading-relaxed">Shahganj, Sadar Bazar, Ab Nagar, Unnao, Uttar Pradesh 209801</p>
                  <a href="https://maps.app.goo.gl/bXzJuwiovM4x1Rsk6?g_st=ac" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3.5 py-2 rounded-xl border border-blue-100 dark:border-blue-800/50 mt-3 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition active:scale-95"><ExternalLink size={14} /> Open Map</a>
                </div>
              </div>
              <div className="flex items-center gap-3.5 bg-gray-50 dark:bg-[#181818] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 transition hover:shadow-md">
                <Phone className="text-green-500 shrink-0" size={22} />
                <div>
                  <p className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Helpline</p>
                  <p className="text-lg font-black text-gray-900 dark:text-white mt-0.5 tracking-wide">+91 63882 93005</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <a href="tel:+916388293005" className="flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 font-black py-3.5 rounded-2xl transition shadow-md text-sm active:scale-95"><Phone size={18} /> Call Now</a>
                <a href="https://wa.me/916388293005" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-2xl transition shadow-md text-sm active:scale-95 shadow-emerald-900/20"><MessageCircle size={18} /> WhatsApp</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}