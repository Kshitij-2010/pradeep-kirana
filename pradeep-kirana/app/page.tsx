"use client";

import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, query, where, doc, getDoc, updateDoc, addDoc } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth, googleProvider } from "@/lib/firebase";
import { useCart } from "@/context/CartContext"; 
import { useWishlist } from "@/context/WishlistContext";
import { Plus, Minus, MapPin, Store, ChevronRight, Search, X, UserCircle, Package, BellRing, Phone, MessageCircle, Clock, ExternalLink, Home, Star, AlertTriangle, CheckCircle2, Heart } from "lucide-react";
import { useRouter } from "next/navigation";

function StoreLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22c55e" />
          <stop offset="1" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fde047" />
          <stop offset="1" stopColor="#eab308" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="28" fill="url(#logoGrad)" />
      <rect x="4" y="4" width="92" height="92" rx="24" stroke="white" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M30 40H70V73C70 75.7614 67.7614 78 65 78H35C32.2386 78 30 75.7614 30 73V40Z" fill="white" fillOpacity="0.12" />
      <path d="M33 40H67V73C67 74.6569 65.6569 76 64 76H36C34.3431 76 33 74.6569 33 73V40Z" stroke="white" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M38 40V31C38 25.4772 42.4772 21 48 21H52C57.5228 21 62 25.4772 62 31V40" stroke="white" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M52 41L40 58H53L46 72" stroke="url(#accentGrad)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

export default function BlinkitStyleStorefront() {
  const router = useRouter();
  
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortBy, setSortBy] = useState("default");
  const [user, setUser] = useState<any>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  
  const [storeStatus, setStoreStatus] = useState({ deliveryPaused: false });
  const [deliveryConfig, setDeliveryConfig] = useState({ baseFee: 10, freeAbove: 100 });
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [ratingVal, setRatingVal] = useState<number>(0);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [notification, setNotification] = useState<{ show: boolean, message: string }>({ show: false, message: "" });
  const prevStatusesRef = useRef<{ [key: string]: string }>({});
  const isFirstLoad = useRef(true);
  
  const { cart, addToCart, removeFromCart, cartTotal, cartCount, isCartOpen, setIsCartOpen } = useCart() as any;
  const { toggleWishlist, isInWishlist } = useWishlist() as any;

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const qOrders = query(collection(db, "orders"), where("customerId", "==", currentUser.uid));
        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
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
            if (isCancelled) {
              playCancellationSound();
            } else {
              playNotificationSound();
            }
            setNotification({ show: true, message: notifyMsg });
            setTimeout(() => setNotification({ show: false, message: "" }), 6000);
          }
          prevStatusesRef.current = newStatuses;
          if (isFirstLoad.current) isFirstLoad.current = false;
        });
        return () => unsubOrders();
      } else {
        setCustomerOrders([]);
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

    return () => { unsubscribeAuth(); unsubscribeDb(); unsubStoreStatus(); unsubDeliveryConfig(); };
  }, []);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (error) { alert("Login nahi ho paya, please dobara try karein."); }
  };

  const handleConfirmReceipt = async (orderId: string, orderType: string) => {
    const newStatus = orderType === "Pickup" ? "Picked Up" : "Delivered";
    try {
      playNotificationSound();
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus,
        customerConfirmedAt: new Date()
      });
      alert(`Thank you! Order marked as ${newStatus} successfully 🎉`);
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Status update nahi ho paya, please dobara try karein.");
    }
  };

  const submitReview = async () => {
    if (!user) { alert("Please login first to write a review! ⭐"); handleLogin(); return; }
    if (ratingVal === 0) { alert("Please select a star rating first!"); return; }

    setIsSubmittingReview(true);
    try {
      await addDoc(collection(db, "reviews"), {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        customerName: user.displayName || "Customer",
        rating: ratingVal,
        reviewText: reviewText,
        createdAt: new Date()
      });

      const productRef = doc(db, "items", selectedProduct.id);
      const productSnap = await getDoc(productRef);
      if (productSnap.exists()) {
        const data = productSnap.data();
        await updateDoc(productRef, {
          ratingSum: (data.ratingSum || 0) + ratingVal,
          ratingCount: (data.ratingCount || 0) + 1
        });
      }

      alert("Review submitted successfully! Thanks for your feedback 🎉");
      setRatingVal(0);
      setReviewText("");
    } catch (error) {
      console.error("Review error:", error);
      alert("Failed to submit review.");
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
    <div className="min-h-screen pb-32 font-sans relative">
      
      {notification.show && (
        <div onClick={() => router.push('/orders')} className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 max-w-lg bg-green-600 text-white p-4 rounded-2xl shadow-2xl cursor-pointer flex items-center justify-between border-2 border-green-400 animate-in slide-in-from-top-5 duration-300 hover:bg-green-700 transition">
          <div className="flex items-center gap-3"><div className="p-2 bg-white/20 rounded-full animate-bounce"><BellRing size={20} /></div><div><p className="text-xs font-bold uppercase tracking-wider text-green-200">Order Update</p><p className="text-sm font-extrabold">{notification.message}</p></div></div>
          <button onClick={(e) => { e.stopPropagation(); setNotification({ show: false, message: "" }); }} className="p-1 hover:bg-black/20 rounded-full transition"><X size={18} /></button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-[#121212] p-3 sm:p-4 shadow-sm border-b dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <StoreLogo className="w-9 h-9 sm:w-10 sm:h-10 shadow-sm shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">Pradeep Kirana</h1>
                <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">Genuine products, fast delivery in Unnao</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end flex-wrap">
              <button onClick={() => setShowContactModal(true)} className="bg-gray-100 dark:bg-[#1e1e1e] hover:bg-gray-200 dark:hover:bg-[#2a2a2a] text-gray-800 dark:text-gray-200 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center gap-1 border border-gray-200 dark:border-gray-700 shadow-sm"><Phone size={13} className="text-blue-500" /> Contact</button>
              {user ? (
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#1a1a1a] p-1 pr-2 sm:pr-3 rounded-full border border-gray-200 dark:border-gray-800">
                  <img src={user.photoURL} alt="Profile" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-green-500 object-cover" />
                  <div className="text-left"><p className="text-[11px] sm:text-xs font-bold leading-tight text-gray-900 dark:text-white">{user.displayName?.split(" ")[0]}</p><button onClick={() => signOut(auth)} className="text-[9px] sm:text-[10px] text-red-500 font-bold hover:underline">Logout</button></div>
                </div>
              ) : (
                <button onClick={handleLogin} className="flex items-center gap-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-bold shadow-md hover:scale-105 transition transform"><UserCircle size={16} /> Login</button>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-400 dark:text-gray-500" size={18} />
            <input type="text" placeholder='Search "Aashirvaad Atta"' value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-100 dark:bg-[#1e1e1e] text-gray-900 dark:text-white border border-transparent dark:border-gray-700 rounded-xl py-2.5 pl-9 pr-4 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors" />
          </div>
        </div>
      </header>

      {storeStatus.deliveryPaused && (
        <div className="bg-orange-100 dark:bg-orange-900/50 border-b border-orange-200 dark:border-orange-800/50 px-4 py-2.5 flex items-center justify-center gap-2 z-30 shadow-sm">
          <AlertTriangle size={18} className="text-orange-600 dark:text-orange-400 shrink-0" />
          <p className="text-xs sm:text-sm font-bold text-orange-800 dark:text-orange-300 text-center">
            Home Delivery is temporarily paused. <span className="underline decoration-2">Only Store Pickup is available.</span>
          </p>
        </div>
      )}

      {/* ACTIVE ORDERS & CONFIRMATION BANNER */}
      {user && activeOrdersNeedingConfirmation.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-4">
          <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white p-4 rounded-2xl shadow-lg border border-green-500">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="animate-pulse" size={20} />
                <h3 className="text-sm font-extrabold uppercase tracking-wide">Confirm Package Receipt</h3>
              </div>
              <span className="bg-white/20 text-xs px-2.5 py-0.5 rounded-full font-bold">{activeOrdersNeedingConfirmation.length} Pending</span>
            </div>

            <div className="space-y-2.5">
              {activeOrdersNeedingConfirmation.map((order) => {
                const isPickup = order.deliveryType === "Pickup" || order.customerDetails?.orderType === "Pickup";
                return (
                  <div key={order.id} className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-green-200">Order ID: #{order.orderId || order.id.slice(0, 6)}</p>
                      <p className="text-sm font-extrabold">Status: <span className="text-yellow-300">Delivered / Ready - Please Confirm</span></p>
                      <p className="text-[11px] text-gray-200">Total Amount: ₹{order.totalAmount}</p>
                    </div>
                    <button 
                      onClick={() => handleConfirmReceipt(order.id, isPickup ? "Pickup" : "Delivery")}
                      className="w-full sm:w-auto bg-white text-green-800 hover:bg-green-50 px-4 py-2 rounded-xl text-xs font-extrabold shadow transition flex items-center justify-center gap-1.5"
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
        <div className="max-w-4xl mx-auto px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>⭐</span> Top Rated Essentials
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {topRatedProducts.map(product => {
              const rCount = product.ratingCount || 1;
              const avg = (product.ratingSum / rCount).toFixed(1);
              return (
                <div key={product.id} onClick={() => setSelectedProduct(product)} className="min-w-[140px] max-w-[140px] bg-white dark:bg-[#171717] rounded-xl p-2.5 border border-gray-100 dark:border-gray-800 shadow-sm cursor-pointer flex-shrink-0 hover:border-green-500/40 transition">
                  <div className="h-24 bg-gray-50 dark:bg-[#1e1e1e] rounded-lg overflow-hidden mb-2 relative flex items-center justify-center">
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <span className="text-green-600 font-bold text-2xl">{product.name.charAt(0)}</span>}
                    <span className="absolute bottom-1 right-1 bg-yellow-400 text-black text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      {avg} <Star size={9} className="fill-current" />
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-1">{product.name}</h4>
                  <p className="text-xs font-bold text-green-600 dark:text-green-500 mt-0.5">₹{product.price}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto flex flex-col md:flex-row gap-6 p-4 mt-2">
        <div className="md:w-1/4 w-full flex md:flex-col overflow-x-auto gap-2 pb-2 scrollbar-hide">
          {dynamicCategories.map((cat: any) => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-shrink-0 text-left px-4 py-3 rounded-xl text-sm font-semibold transition border ${activeCategory === cat ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 border-green-600 dark:border-green-600/50" : "bg-white dark:bg-[#171717] text-gray-600 dark:text-gray-300 border-transparent hover:bg-gray-50 dark:hover:bg-[#222]"}`}>{cat}</button>
          ))}
        </div>

        <div className="md:w-3/4 w-full">
          {/* Sorting Bar */}
          <div className="flex justify-between items-center mb-4 px-1">
            <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white">
              {activeCategory === "All" ? "All Groceries & Essentials" : activeCategory}
            </h2>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)} 
              className="bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none shadow-sm cursor-pointer"
            >
              <option value="default">Sort By: Featured</option>
              <option value="low-high">Price: Low to High</option>
              <option value="high-low">Price: High to Low</option>
              <option value="rating">Highest Rated ⭐</option>
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-pulse">{[1,2,3,4,5,6].map(n => <div key={n} className="h-56 bg-gray-200 dark:bg-[#1e1e1e] rounded-xl"></div>)}</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">{searchQuery ? "No products found." : "Dukan mein abhi koi saaman nahi hai!"}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const inCart = cart.find((item: any) => item.id === product.id)?.cartQuantity || 0;
                const isOutOfStock = product.stockQuantity <= 0;
                const rCount = product.ratingCount || 0;
                const avgRating = rCount > 0 ? (product.ratingSum / rCount).toFixed(1) : "New";
                const isSaved = isInWishlist(product.id);

                return (
                  <div key={product.id} className="bg-white dark:bg-[#171717] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col relative transition-colors hover:border-green-500/30">
                    
                    {/* Wishlist Heart Button */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleWishlist(product); }} 
                      className="absolute top-2.5 right-2.5 z-20 p-2 bg-white/80 dark:bg-black/50 backdrop-blur-md rounded-full shadow transition hover:scale-110"
                    >
                      <Heart size={16} className={isSaved ? "fill-red-500 text-red-500" : "text-gray-500 dark:text-gray-300"} />
                    </button>

                    <div onClick={() => setSelectedProduct(product)} className="h-32 bg-gray-50 dark:bg-[#1e1e1e] flex items-center justify-center overflow-hidden border-b border-gray-100 dark:border-gray-800 relative cursor-pointer">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" /> : <span className="text-green-800 dark:text-green-500 font-bold text-4xl uppercase">{product.name.charAt(0)}</span>}
                      {isOutOfStock && <div className="absolute inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center z-10"><span className="bg-red-500 text-white px-3 py-1 rounded font-bold text-xs uppercase tracking-wider shadow-sm">Out of Stock</span></div>}
                    </div>
                    
                    <div className="p-3 flex flex-col flex-grow">
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-500 mb-1">
                        <div className={`flex items-center px-1.5 py-0.5 rounded font-bold ${rCount > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {avgRating} {rCount > 0 && <Star size={10} className="fill-current ml-0.5" />}
                        </div>
                        <span className="font-medium">({rCount > 0 ? rCount : 'No'} reviews)</span>
                      </div>

                      <h3 onClick={() => setSelectedProduct(product)} className="text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight mb-1 cursor-pointer hover:text-green-600 transition-colors">{product.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{product.unit}</p>
                      
                      <div className="mt-auto flex items-center justify-between">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">₹{product.price}</span>
                        {!isOutOfStock && (
                          inCart > 0 ? (
                            <div className="flex items-center bg-green-600 dark:bg-green-700 text-white rounded-md shadow-sm z-20">
                              <button onClick={() => removeFromCart(product.id)} className="p-1.5 hover:bg-green-700 rounded-l-md"><Minus size={14}/></button>
                              <span className="px-2 font-bold text-sm">{inCart}</span>
                              <button onClick={() => addToCart(product)} disabled={inCart >= product.stockQuantity} className="p-1.5 hover:bg-green-700 rounded-r-md disabled:opacity-50"><Plus size={14}/></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(product)} className="border border-green-600 text-green-700 bg-green-50 px-4 py-1.5 rounded-md text-sm font-bold hover:bg-green-600 hover:text-white dark:bg-transparent dark:text-green-400 dark:hover:bg-green-600 transition z-20">ADD</button>
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

      {/* Cart & Bottom Nav */}
      {cartCount > 0 && (
        <div className="fixed bottom-16 left-0 w-full p-3 bg-white dark:bg-[#121212] border-t border-gray-200 dark:border-gray-800 z-40 animate-in slide-in-from-bottom-5">
          <div className="max-w-4xl mx-auto"><button onClick={() => setIsCartOpen(true)} className="w-full bg-green-700 dark:bg-green-600 text-white rounded-xl py-3 px-4 flex items-center justify-between shadow-lg hover:scale-[1.01] transition transform"><div className="flex flex-col items-start"><span className="text-xs font-semibold">{cartCount} items</span><span className="text-base font-bold">₹{finalCartTotalWithDelivery.toFixed(2)}</span></div><div className="flex items-center gap-1 font-bold text-sm">View Cart <ChevronRight size={18} /></div></button></div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 w-full bg-white dark:bg-[#121212] border-t border-gray-200 dark:border-gray-800 z-50 py-2.5 px-8 flex justify-around items-center shadow-2xl">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-1 text-green-600 dark:text-green-500 font-bold text-xs"><Home size={22} /><span>Home</span></button>
        <button onClick={() => router.push('/wishlist')} className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-500 font-semibold text-xs"><Heart size={22} /><span>Saved</span></button>
        <button onClick={() => { if (!user) { alert("Please login first!"); handleLogin(); } else router.push('/orders'); }} className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-500 font-semibold text-xs"><Package size={22} /><span>Orders</span></button>
      </nav>

      {/* CART SIDEBAR */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#121212] h-full shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-[#1e1e1e]">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">Your Cart</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] rounded-full transition"><X size={24} /></button>
            </div>
            
            {storeStatus.deliveryPaused && (
              <div className="bg-orange-50 dark:bg-orange-900/30 p-3 text-xs font-bold text-orange-800 dark:text-orange-400 border-b border-orange-100 dark:border-orange-800/50 flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                Note: Delivery is off. You will only be able to place a Store Pickup order.
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {cart.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 dark:bg-[#1a1a1a] p-3 mb-2 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover border border-gray-200 dark:border-gray-700" /> : <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center font-bold">{item.name.charAt(0)}</div>}
                    <div><h4 className="font-semibold text-gray-900 dark:text-white text-sm">{item.name}</h4><p className="text-sm text-gray-500 dark:text-gray-400">₹{item.price}</p></div>
                  </div>
                  <div className="flex items-center bg-white dark:bg-[#121212] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                    <button onClick={() => removeFromCart(item.id)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition"><Minus size={16}/></button>
                    <span className="px-3 font-semibold text-gray-900 dark:text-white text-sm">{item.cartQuantity}</span>
                    <button onClick={() => addToCart(item)} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition"><Plus size={16}/></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e]">
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between items-center text-gray-600 dark:text-gray-400">
                  <span>Item Total</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹{cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-600 dark:text-gray-400">
                  <span>Delivery Charges</span>
                  <span className="font-semibold">
                    {cartTotal < deliveryConfig.freeAbove ? `₹${deliveryConfig.baseFee}.00` : <span className="text-green-600 dark:text-green-500 font-bold uppercase text-xs">FREE</span>}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-lg font-bold text-gray-900 dark:text-white">
                <span>Total Amount</span>
                <span className="text-green-600 dark:text-green-500">₹{finalCartTotalWithDelivery.toFixed(2)}</span>
              </div>

              <div className="mb-4 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/50 flex items-center gap-1.5">
                <span>🏷️</span>
                <span>Apply coupons and promo codes on the checkout page</span>
              </div>

              <button onClick={() => { setIsCartOpen(false); if(!user) { alert("Login to Checkout!"); handleLogin(); } else router.push('/checkout'); }} className="w-full bg-green-700 dark:bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-800 dark:hover:bg-green-500 transition shadow-md">Proceed to Checkout</button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT DETAILS MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-200 relative flex flex-col max-h-[90vh]">
            <button onClick={() => { setSelectedProduct(null); setRatingVal(0); setReviewText(""); }} className="absolute top-4 right-4 z-10 p-2 bg-white/80 dark:bg-black/50 backdrop-blur-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full shadow-sm transition"><X size={20} /></button>
            <div className="h-48 sm:h-56 bg-gray-50 dark:bg-[#1e1e1e] flex items-center justify-center overflow-hidden shrink-0 relative border-b border-gray-200 dark:border-gray-800">
               {selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" /> : <span className="text-green-800 dark:text-green-500 font-bold text-8xl uppercase">{selectedProduct.name.charAt(0)}</span>}
            </div>

            <div className="p-6 overflow-y-auto flex flex-col flex-grow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-green-600 dark:text-green-500 uppercase tracking-wider">{selectedProduct.category}</span>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {(() => {
                    const rCount = selectedProduct.ratingCount || 0;
                    const avg = rCount > 0 ? (selectedProduct.ratingSum / rCount).toFixed(1) : "New";
                    return (
                      <><div className={`flex items-center px-2 py-0.5 rounded font-bold ${rCount > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>{avg} {rCount > 0 && <Star size={12} className="fill-current ml-1" />}</div><span className="font-medium">({rCount > 0 ? rCount : '0'} reviews)</span></>
                    );
                  })()}
                </div>
              </div>

              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-1">{selectedProduct.name}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 font-medium">{selectedProduct.unit}</p>

              <div className="mb-4 bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Write a Review</p>
                <div className="flex items-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setRatingVal(star)} onMouseEnter={() => setHoveredStar(star)} onMouseLeave={() => setHoveredStar(null)} className="p-1 hover:scale-110 transition-transform">
                      <Star size={24} className={`transition-colors ${(hoveredStar ? star <= hoveredStar : star <= ratingVal) ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-gray-600"}`} />
                    </button>
                  ))}
                </div>
                <textarea 
                  value={reviewText} 
                  onChange={(e) => setReviewText(e.target.value)} 
                  placeholder="How was the product? Type your review here..." 
                  className="w-full bg-white dark:bg-[#121212] text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none mb-3" 
                  rows={2}
                ></textarea>
                <button onClick={submitReview} disabled={isSubmittingReview || ratingVal === 0} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2.5 rounded-xl transition disabled:opacity-50 text-sm shadow-sm">
                  {isSubmittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </div>

              <div className="flex items-center justify-between mt-auto bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                 <span className="text-2xl font-extrabold text-gray-900 dark:text-white">₹{selectedProduct.price}</span>
                 {(() => {
                   const inCart = cart.find((item: any) => item.id === selectedProduct.id)?.cartQuantity || 0;
                   if (selectedProduct.stockQuantity <= 0) return <span className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-4 py-2 rounded-xl font-bold border border-red-200 dark:border-red-800/50">Out of Stock</span>;
                   if (inCart > 0) return (
                    <div className="flex items-center bg-green-600 dark:bg-green-700 text-white rounded-xl shadow-md border border-green-700 dark:border-green-600"><button onClick={() => removeFromCart(selectedProduct.id)} className="p-3 hover:bg-green-700 dark:hover:bg-green-600 rounded-l-xl transition"><Minus size={18}/></button><span className="px-4 font-bold text-lg">{inCart}</span><button onClick={() => addToCart(selectedProduct)} disabled={inCart >= selectedProduct.stockQuantity} className="p-3 hover:bg-green-700 dark:hover:bg-green-600 rounded-r-xl disabled:opacity-50 transition"><Plus size={18}/></button></div>
                   );
                   return <button onClick={() => addToCart(selectedProduct)} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transform hover:scale-105 transition shadow-md">ADD</button>;
                 })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTACT MODAL */}
      {showContactModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h3 className="font-extrabold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Store className="text-green-600" size={20} /> Pradeep Kirana Store</h3>
              <button onClick={() => setShowContactModal(false)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 bg-gray-50 dark:bg-[#1a1a1a] p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800">
                <MapPin className="text-red-500 shrink-0 mt-1" size={20} />
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Store Address</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">Shahganj, Sadar Bazar, Ab Nagar, Unnao, Uttar Pradesh 209801</p>
                  <a href="https://maps.app.goo.gl/bXzJuwiovM4x1Rsk6?g_st=ac" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 mt-2 hover:underline transition"><ExternalLink size={13} /> Open in Google Maps</a>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#1a1a1a] p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800">
                <Phone className="text-green-500 shrink-0" size={20} />
                <div>
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Helpline Number</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">+91 63882 93005</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <a href="tel:+916388293005" className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-md text-sm"><Phone size={16} /> Call Now</a>
                <a href="https://wa.me/916388293005" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition shadow-md text-sm"><MessageCircle size={16} /> WhatsApp</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 