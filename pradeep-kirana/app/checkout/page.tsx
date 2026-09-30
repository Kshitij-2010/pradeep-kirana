"use client";

import { useState, useEffect } from "react";
import { collection, doc, getDoc, setDoc, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { useCart } from "@/context/CartContext";
import { useRouter } from "next/navigation";
import { MapPin, Navigation2, CheckCircle2, Banknote, QrCode, Store, Truck, AlertTriangle, Tag } from "lucide-react";

export default function CheckoutPage() {
  const { cart, cartTotal, clearCart } = useCart() as any;
  const router = useRouter();
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  
  const [storeStatus, setStoreStatus] = useState({ deliveryPaused: false });
  
  // ================= DYNAMIC DELIVERY CONFIG FROM DB =================
  const [deliveryConfig, setDeliveryConfig] = useState({ baseFee: 10, freeAbove: 100 });

  const [locationCoords, setLocationCoords] = useState<{lat: number, lng: number} | null>(null);
  const [saveAddress, setSaveAddress] = useState(true); 
  
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{code: string, discount: number} | null>(null);
  const [promoError, setPromoError] = useState("");
  const [checkingPromo, setCheckingPromo] = useState(false);

  // UI Calculation (Actual calculation happens securely on the backend)
  const deliveryFee = (cartTotal < deliveryConfig.freeAbove) ? deliveryConfig.baseFee : 0;
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    mapLink: "",
    paymentMethod: "Cash on Delivery",
    orderType: "Delivery" 
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setFormData(prev => ({
            ...prev,
            name: data.name || currentUser.displayName || "",
            phone: data.phone || "",
            address: data.address || "",
            mapLink: data.mapLink || ""
          }));
          if (data.lat && data.lng) setLocationCoords({ lat: data.lat, lng: data.lng });
        } else {
          setFormData(prev => ({ ...prev, name: currentUser.displayName || "" }));
        }
      }
    });

    const unsubStoreStatus = onSnapshot(doc(db, "settings", "storeStatus"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setStoreStatus(data);
        if (data.deliveryPaused) setFormData(prev => ({ ...prev, orderType: "Pickup" }));
      }
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

    return () => { unsubscribeAuth(); unsubStoreStatus(); unsubDeliveryConfig(); };
  }, []);

  const handleGetLocation = () => {
    if (!navigator.geolocation) { alert("Your browser does not support location features."); return; }
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLocationCoords({ lat, lng });
        setFormData({ ...formData, mapLink: `https://www.google.com/maps?q=${lat},${lng}` });
        setFetchingLocation(false);
      },
      (error) => { alert("Please allow location permissions."); setFetchingLocation(false); }
    );
  };

  const applyPromoCode = async () => {
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError("");

    try {
      const q = query(collection(db, "coupons"), where("code", "==", promoCode.toUpperCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setPromoError("Invalid promo code.");
        setAppliedPromo(null);
      } else {
        const couponData = querySnapshot.docs[0].data();
        if (cartTotal < couponData.minOrderAmount) {
          setPromoError(`Minimum order amount for this code is ₹${couponData.minOrderAmount}`);
          setAppliedPromo(null);
        } else {
          setAppliedPromo({ code: couponData.code, discount: couponData.discountAmount });
          setPromoError("");
        }
      }
    } catch (err) { setPromoError("Failed to verify code."); }
    setCheckingPromo(false);
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError("");
  };

  const actualDeliveryFee = formData.orderType === "Delivery" ? deliveryFee : 0;
  const discountAmount = appliedPromo ? appliedPromo.discount : 0;
  const finalTotal = Math.max(0, cartTotal + actualDeliveryFee - discountAmount);

  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-300">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Your Cart is Empty!</h2>
        <button onClick={() => router.push('/')} className="bg-green-700 dark:bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-800 transition">Back to Store</button>
      </div>
    );
  }

  // ================= SECURE ORDER PLACEMENT =================
  const handlePlaceOrder = async (e: any) => {
    e.preventDefault();
    if (!user) { alert("Please login first to place an order."); return; }
    if (storeStatus.deliveryPaused && formData.orderType === "Delivery") { alert("Home Delivery is currently paused. Please select Store Pickup."); return; }

    setLoading(true);

    try {
      // 1. Verify if user has an active order waiting for confirmation
      const qActive = query(collection(db, "orders"), where("customerId", "==", user.uid));
      const activeSnapshot = await getDocs(qActive);
      
      const hasUnconfirmedOrder = activeSnapshot.docs.some(docSnap => {
        const status = docSnap.data().status;
        return status === "Awaiting Confirmation" || status === "Awaiting Pickup Confirmation";
      });

      if (hasUnconfirmedOrder) {
        alert("You have an order awaiting your confirmation! Please confirm receipt of your previous order before placing a new one.");
        setLoading(false);
        return;
      }

      // 2. Prepare Secure Payload (Only send item IDs and quantities, backend checks price & stock)
      const orderPayload = {
        items: cart.map((item: any) => ({
          id: item.id,
          cartQuantity: item.cartQuantity
        })),
        couponCode: appliedPromo ? appliedPromo.code : null,
        uid: user.uid,
        customerDetails: formData
      };

      // 3. Send to Server securely
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Transaction failed");
      }

      // 4. If address save is checked, securely update user profile
      if (saveAddress && formData.orderType === "Delivery") {
        await setDoc(doc(db, "users", user.uid), {
          name: formData.name, 
          phone: formData.phone, 
          address: formData.address, 
          mapLink: formData.mapLink,
          lat: locationCoords?.lat || null, 
          lng: locationCoords?.lng || null
        }, { merge: true });
      }

      alert(`✅ Order Successfully Placed!\nEverything has been verified securely.`);
      if(clearCart) clearCart(); 
      router.push("/orders");
      
    } catch (error: any) { 
      console.error("Order failed:", error);
      alert(`❌ Order failed: ${error.message}`); 
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#121212] p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
        <h1 className="text-2xl font-extrabold mb-6 border-b border-gray-200 dark:border-gray-800 pb-4 text-gray-900 dark:text-white">Checkout</h1>
        
        {/* Order Summary */}
        <div className="mb-6 bg-gray-50 dark:bg-[#1e1e1e] p-4 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors">
          <h2 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">Order Summary</h2>
          {cart.map((item: any) => (
            <div key={item.id} className="flex justify-between text-sm mb-2 text-gray-700 dark:text-gray-300">
              <span>{item.cartQuantity}x {item.name}</span>
              <span className="font-semibold text-gray-900 dark:text-white">₹{item.price * item.cartQuantity}</span>
            </div>
          ))}
          
          <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex justify-between">
              <span>Item Total:</span>
              <span className="font-semibold">₹{cartTotal.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between">
              <span>Delivery Fee:</span>
              {formData.orderType === "Pickup" ? (
                 <span className="text-green-600 dark:text-green-500 font-bold border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded text-[10px] uppercase">Free (Pickup)</span>
              ) : deliveryFee === 0 ? (
                 <span className="text-green-600 dark:text-green-500 font-bold border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded text-[10px] uppercase">Free Delivery</span>
              ) : (
                 <span className="font-semibold">₹{deliveryFee.toFixed(2)}</span>
              )}
            </div>

            {appliedPromo && (
              <div className="flex justify-between text-green-600 dark:text-green-500 font-bold">
                <span>Discount ({appliedPromo.code}):</span>
                <span>-₹{appliedPromo.discount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3 flex justify-between font-bold text-lg text-gray-900 dark:text-white">
            <span>Total Payable:</span><span className="text-green-700 dark:text-green-500">₹{finalTotal.toFixed(2)}</span>
          </div>

          {/* Promo Code Section */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
             {appliedPromo ? (
               <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 p-3 rounded-lg">
                 <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-sm">
                   <Tag size={16} /> '{appliedPromo.code}' Applied!
                 </div>
                 <button onClick={removePromoCode} className="text-xs text-red-500 hover:underline font-bold">Remove</button>
               </div>
             ) : (
               <div>
                 <div className="flex gap-2">
                   <input type="text" placeholder="Enter Promo Code" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-[#121212] text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 outline-none uppercase" />
                   <button type="button" onClick={applyPromoCode} disabled={checkingPromo || !promoCode} className="bg-gray-800 dark:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 transition">
                     {checkingPromo ? "..." : "Apply"}
                   </button>
                 </div>
                 {promoError && <p className="text-xs text-red-500 mt-1 font-medium">{promoError}</p>}
               </div>
             )}
          </div>
        </div>

        <form onSubmit={handlePlaceOrder} className="space-y-4">
          
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-3 text-gray-800 dark:text-gray-300">Order Preference</label>
            {storeStatus.deliveryPaused && (
               <div className="mb-3 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/50 flex items-start gap-2">
                 <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
                 <p className="text-xs font-bold text-red-700 dark:text-red-400">Home delivery is currently paused. Only store pickup is available.</p>
               </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl transition ${storeStatus.deliveryPaused ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-[#171717] grayscale' : formData.orderType === 'Delivery' ? 'border-green-500 bg-green-50 dark:bg-green-900/20 cursor-pointer' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] cursor-pointer'}`}>
                <input type="radio" name="orderType" value="Delivery" disabled={storeStatus.deliveryPaused} checked={formData.orderType === 'Delivery' && !storeStatus.deliveryPaused} onChange={(e) => setFormData({...formData, orderType: e.target.value})} className="w-4 h-4 text-green-600 focus:ring-green-500 disabled:opacity-50" />
                <Truck className={formData.orderType === 'Delivery' && !storeStatus.deliveryPaused ? "text-green-600" : "text-gray-400"} size={20} />
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Home Delivery</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{storeStatus.deliveryPaused ? "Unavailable" : (cartTotal < deliveryConfig.freeAbove ? `₹${deliveryConfig.baseFee} charge (Free above ₹${deliveryConfig.freeAbove})` : "Free Delivery")}</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${formData.orderType === 'Pickup' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]'}`}>
                <input type="radio" name="orderType" value="Pickup" checked={formData.orderType === 'Pickup'} onChange={(e) => setFormData({...formData, orderType: e.target.value})} className="w-4 h-4 text-orange-600 focus:ring-orange-500" />
                <Store className={formData.orderType === 'Pickup' ? "text-orange-600" : "text-gray-400"} size={20} />
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Store Pickup</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Free • Collect from store</p>
                </div>
              </label>
            </div>
          </div>

          <div><label className="block text-sm font-semibold mb-1 text-gray-800 dark:text-gray-300">Full Name</label><input required type="text" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} /></div>
          <div><label className="block text-sm font-semibold mb-1 text-gray-800 dark:text-gray-300">Phone Number</label><input required type="tel" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} /></div>
          
          {formData.orderType === "Delivery" ? (
            <div className="relative animate-in fade-in duration-300">
              <div className="flex justify-between items-end mb-1">
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-300">Delivery Address</label>
                <button type="button" onClick={handleGetLocation} disabled={fetchingLocation} className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 px-3 py-1.5 rounded-md border border-blue-200 dark:border-blue-800/50 transition"><Navigation2 size={14} className={fetchingLocation ? "animate-pulse" : ""} /> {fetchingLocation ? "Locating..." : "Use Live Location"}</button>
              </div>
              <textarea required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" rows={2} value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              
              {locationCoords && (
                <div className="mt-3 w-full h-48 rounded-xl overflow-hidden border-2 border-green-500/50 relative shadow-inner">
                  <iframe width="100%" height="100%" frameBorder="0" scrolling="no" src={`https://maps.google.com/maps?q=${locationCoords.lat},${locationCoords.lng}&hl=en&z=15&output=embed`}></iframe>
                  <div className="absolute bottom-2 right-2 bg-green-600 text-white text-[10px] px-2 py-1 rounded shadow-md flex items-center gap-1 font-bold"><CheckCircle2 size={12} /> Attached</div>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="saveAddress" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 transition"/>
                <label htmlFor="saveAddress" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">Save this location for future orders</label>
              </div>
            </div>
          ) : (
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800/30 text-orange-800 dark:text-orange-300 text-sm font-medium animate-in fade-in duration-300 shadow-sm">
              🏬 <b className="ml-1">Pickup Selected:</b> Please visit Pradeep Kirana Store, Unnao to collect your items.
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
            <label className="block text-sm font-semibold mb-3 text-gray-800 dark:text-gray-300">Mode of Payment</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${formData.paymentMethod === 'Cash on Delivery' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]'}`}>
                <input type="radio" name="paymentMethod" value="Cash on Delivery" checked={formData.paymentMethod === 'Cash on Delivery'} onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})} className="w-4 h-4 text-green-600 focus:ring-green-500" />
                <Banknote className={formData.paymentMethod === 'Cash on Delivery' ? "text-green-600" : "text-gray-400"} size={20} />
                <div><p className="text-sm font-bold text-gray-900 dark:text-white">Cash / Pay at Shop</p><p className="text-[10px] text-gray-500 mt-0.5">Pay directly</p></div>
              </label>

              <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${formData.paymentMethod === 'UPI on Delivery' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]'}`}>
                <input type="radio" name="paymentMethod" value="UPI on Delivery" checked={formData.paymentMethod === 'UPI on Delivery'} onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                <QrCode className={formData.paymentMethod === 'UPI on Delivery' ? "text-blue-600" : "text-gray-400"} size={20} />
                <div><p className="text-sm font-bold text-gray-900 dark:text-white">UPI / Online</p><p className="text-[10px] text-gray-500 mt-0.5">Pay via GPay, Paytm</p></div>
              </label>
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-green-700 dark:bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-800 dark:hover:bg-green-500 transition shadow-lg mt-6 flex justify-center items-center">
            {loading ? (
              <div className="flex items-center gap-2"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Verifying & Placing...</div>
            ) : `Place Order • ₹${finalTotal.toFixed(2)}`}
          </button>
        </form>
      </div>
    </div>
  );
}