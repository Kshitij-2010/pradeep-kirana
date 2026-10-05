"use client";

import { useEffect, useState, useRef } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, runTransaction } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth, googleProvider } from "@/lib/firebase";
import { MapPin, Phone, ExternalLink, Package, Clock, CheckCircle, Bike, Box, Search, Save, Plus, X, Trash2, Link, Pencil, Calendar, CreditCard, Store, Truck, Lock, TrendingUp, AlertTriangle, Users, Filter, MessageCircle, Star, Tag, Download, Settings, ShieldCheck, CheckCircle2, Zap } from "lucide-react";

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
      gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(587.33, 0, 0.15); 
    playTone(880, 0.15, 0.3);  
  } catch (e) { console.error(e); }
};

const StockEditor = ({ item, showToast }: { item: any, showToast: any }) => {
  const [stock, setStock] = useState(item.stockQuantity);
  const [saving, setSaving] = useState(false);
  const handleUpdate = async () => {
    setSaving(true);
    try {
      const value = Number(stock);
      if (!Number.isInteger(value) || value < 0 || value > 1000000) {
        showToast("Stock must be a non-negative integer.", "error");
        return;
      }
      await updateDoc(doc(db, "items", item.id), { stockQuantity: value });
      showToast("Stock updated successfully! 📦", "success");
    } catch (error) { 
      showToast("Failed to update stock!", "error"); 
    }
    setSaving(false);
  };
  const isChanged = Number(stock) !== item.stockQuantity;

  return (
    <div className="flex items-center gap-2">
      <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-16 md:w-20 p-1.5 md:p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white text-center font-bold focus:ring-2 focus:ring-green-500 outline-none transition text-sm md:text-base" />
      {isChanged && <button onClick={handleUpdate} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white p-1.5 md:p-2 rounded-lg transition animate-in zoom-in duration-200">{saving ? <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}</button>}
    </div>
  );
};

export default function AdminDashboard() {
  // ================= TOAST NOTIFICATION STATE =================
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' | 'info' }>({ show: false, message: "", type: 'info' });
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
  };

  // ================= AUTH STATES =================
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  // ================= DASHBOARD STATES =================
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const [activeTab, setActiveTab] = useState<"orders" | "inventory" | "customers" | "reviews" | "coupons" | "offers" | "settings">("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [viewedReviewIds, setViewedReviewIds] = useState<Set<string>>(new Set());
  const [salesFilter, setSalesFilter] = useState<"This Week" | "This Month" | "This Year" | "Total">("Total");
  
  const [storeStatus, setStoreStatus] = useState({ deliveryPaused: false, storePaused: false, autoTimeEnabled: false, openTime: "09:00", closeTime: "21:00" });
  const [deliveryConfig, setDeliveryConfig] = useState({ baseFee: 20, freeAbove: 300 });
  const [savingDeliveryConfig, setSavingDeliveryConfig] = useState(false);
  const [timingConfig, setTimingConfig] = useState({ enabled: false, open: "09:00", close: "21:00" });
  const [savingTimings, setSavingTimings] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  
  const [newItem, setNewItem] = useState({ name: "", category: "Atta & Dal", price: "", originalPrice: "", stockQuantity: "", unit: "", imageUrl: "", offerText: "", offerId: "" });
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [showCouponModal, setShowCouponModal] = useState(false);
  const [newCoupon, setNewCoupon] = useState({ code: "", discountAmount: "", minOrderAmount: "" });
  const [addingCoupon, setAddingCoupon] = useState(false);

  // Offers State
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [newOffer, setNewOffer] = useState({ name: "", label: "", type: "BOGO" });
  const [addingOffer, setAddingOffer] = useState(false);

  const isFirstLoad = useRef(true);
  const checkedGlitchesRef = useRef<Set<string>>(new Set());
  
  const categories = ["Atta & Dal", "Snacks", "Dairy", "Spices", "Drinks", "+ Add New Category"];

  // ================= SECURE FIREBASE ADMIN AUTHENTICATION =================
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAuthenticated(false);
        setCheckingAuth(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const isAdmin = userDoc.exists() && userDoc.data().role === "admin";

        if (!isAdmin) {
          await signOut(auth);
          setIsAuthenticated(false);
          setAuthError("Access Denied: You do not have Administrator privileges.");
          showToast("Unauthorized access attempt blocked.", "error");
          return;
        }

        setIsAuthenticated(true);
        setAuthError("");
      } catch (error) {
        console.error("Auth verification failed", error);
        try { await signOut(auth); } catch {}
        setIsAuthenticated(false);
        setAuthError("Security check failed. Please try again.");
      } finally {
        setCheckingAuth(false);
      }
    });

    const storedViewedReviews = localStorage.getItem("pradeep_viewed_reviews");
    if (storedViewedReviews) {
      try { setViewedReviewIds(new Set(JSON.parse(storedViewedReviews))); } catch {}
    }

    return () => unsub();
  }, []);

  // ================= ADMIN LOGIN / LOGOUT =================
  const handleAdminLogin = async () => {
    try {
      setAuthError("");
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google Sign-In failed", error);
      setAuthError("Google Sign-In failed or was cancelled.");
    }
  };

  const handleLockOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      setIsAuthenticated(false);
      showToast("Admin session signed out securely.", "info");
    }
  };

  // ================= MAIN DATA FETCHING =================
  useEffect(() => {
    if (!isAuthenticated) return;
    const qOrders = query(collection(db, "orders"), orderBy("orderDate", "desc"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const ordersData: any[] = [];
      snapshot.forEach((doc) => { ordersData.push({ id: doc.id, ...doc.data() }); });
      if (!isFirstLoad.current && ordersData.length > 0 && ordersData[0].status === "Pending") playNotificationSound();
      else isFirstLoad.current = false;
      setOrders(ordersData);
    });

    const qProducts = query(collection(db, "items"));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const itemsData: any[] = [];
      snapshot.forEach((doc) => { itemsData.push({ id: doc.id, ...doc.data() }); });
      setProducts(itemsData);
    });

    const qReviews = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
    const unsubReviews = onSnapshot(qReviews, (snapshot) => {
      const revData: any[] = [];
      snapshot.forEach((doc) => { revData.push({ id: doc.id, ...doc.data() }); });
      setReviews(revData);
    });

    const unsubCoupons = onSnapshot(query(collection(db, "coupons")), (snapshot) => {
      const couponData: any[] = [];
      snapshot.forEach((doc) => { couponData.push({ id: doc.id, ...doc.data() }); });
      setCoupons(couponData);
    });

    const unsubOffers = onSnapshot(query(collection(db, "offers")), (snapshot) => {
      const offData: any[] = [];
      snapshot.forEach((doc) => { offData.push({ id: doc.id, ...doc.data() }); });
      setOffers(offData);
      setLoading(false);
    });

    const unsubStoreStatus = onSnapshot(doc(db, "settings", "storeStatus"), (docSnap) => {
      if (docSnap.exists()) { 
        const data = docSnap.data() as any;
        setStoreStatus(data); 
        setTimingConfig({
          enabled: data.autoTimeEnabled || false,
          open: data.openTime || "09:00",
          close: data.closeTime || "21:00"
        });
      }
    });

    const unsubDeliveryConfig = onSnapshot(doc(db, "settings", "deliveryConfig"), (docSnap) => {
      if (docSnap.exists()) {
        setDeliveryConfig(docSnap.data() as any);
      }
    });

    return () => { unsubOrders(); unsubProducts(); unsubReviews(); unsubCoupons(); unsubOffers(); unsubStoreStatus(); unsubDeliveryConfig(); };
  }, [isAuthenticated]);

  // ================= LEGACY READ-ONLY GLITCH SCANNER =================
  useEffect(() => {
    const scanForLegacyGlitchedOrders = async () => {
      for (const order of orders) {
        if (order.status === "Pending" && !checkedGlitchesRef.current.has(order.id)) {
          checkedGlitchesRef.current.add(order.id);
          let isGlitched = false;
          for (const item of order.items) {
            const itemRef = doc(db, "items", item.id);
            const itemSnap = await getDoc(itemRef);
            if (!itemSnap.exists() || itemSnap.data().stockQuantity < 0) {
               isGlitched = true;
               break;
            }
          }
          if (isGlitched) {
             showToast(`⚠️ Glitch Detected: Order #${order.orderId || order.id.slice(0,6)} has out of stock items. Please cancel it.`, "error");
          }
        }
      }
    };
    if (isAuthenticated && orders.length > 0) {
      scanForLegacyGlitchedOrders();
    }
  }, [orders, isAuthenticated]);

  useEffect(() => {
    if (activeTab === "reviews" && reviews.length > 0) {
      const allIds = reviews.map(r => r.id);
      const newSet = new Set([...Array.from(viewedReviewIds), ...allIds]);
      setViewedReviewIds(newSet);
      localStorage.setItem("pradeep_viewed_reviews", JSON.stringify(Array.from(newSet)));
    }
  }, [activeTab, reviews]);

  const ORDER_STATUSES = [
    "Pending",
    "Accepted",
    "Awaiting Confirmation",
    "Awaiting Pickup Confirmation",
    "Ready for Pickup",
    "Out for Delivery",
    "On the Way",
    "Delivered",
    "Picked Up",
    "Cancelled"
  ] as const;

  const cancelOrderTransaction = async (orderId: string, reason: string) => {
    const orderRef = doc(db, "orders", orderId);

    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) throw new Error("ORDER_NOT_FOUND");

      const orderData = orderSnap.data();
      if (orderData.status === "Cancelled") throw new Error("ORDER_ALREADY_CANCELLED");

      const items = Array.isArray(orderData.items) ? orderData.items : [];
      const refs = items.map((item: any) => doc(db, "items", String(item.id)));
      const snapshots = [];

      for (const ref of refs) snapshots.push(await transaction.get(ref));

      snapshots.forEach((snap, index) => {
        if (!snap.exists()) throw new Error("ORDER_ITEM_NOT_FOUND");
        const qty = Number(items[index]?.cartQuantity);
        const currentStock = Number(snap.data().stockQuantity);
        if (!Number.isInteger(qty) || qty <= 0 || qty > 100) throw new Error("INVALID_ORDER_QUANTITY");
        if (!Number.isInteger(currentStock) || currentStock < 0) throw new Error("INVALID_STOCK_DATA");
        transaction.update(refs[index], { stockQuantity: currentStock + qty });
      });

      transaction.update(orderRef, {
        status: "Cancelled",
        cancellationReason: String(reason || "").trim().slice(0, 500)
      });
    });
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    if (!(ORDER_STATUSES as readonly string[]).includes(newStatus)) {
      showToast("Invalid order status.", "error");
      return;
    }

    try {
      if (newStatus === "Cancelled") {
        await cancelOrderTransaction(orderId, "Cancelled by admin");
      } else {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
      }
      showToast(`Order status updated to "${newStatus}" successfully! ✅`, "success");
    } catch (error: any) {
      console.error("Order status update failed", error);
      const message = error?.message === "ORDER_ALREADY_CANCELLED"
        ? "This order has already been cancelled."
        : "Update failed.";
      showToast(message, "error");
    }
  };

  const handleOpenCancelModal = (orderId: string) => {
    setCancellingOrderId(orderId);
    setCancellationReason("");
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingOrderId) return;

    try {
      await cancelOrderTransaction(cancellingOrderId, cancellationReason);
      setShowCancelModal(false);
      setCancellingOrderId(null);
      setCancellationReason("");
      showToast("Order cancelled successfully! ❌", "success");
    } catch (error: any) {
      console.error("Cancellation failed", error);
      if (error?.message === "ORDER_ALREADY_CANCELLED") {
        showToast("This order has already been cancelled.", "error");
      } else {
        showToast("Failed to cancel order.", "error");
      }
    }
  };

  const toggleDelivery = async () => {
    const ref = doc(db, "settings", "storeStatus");
    const newStatus = !storeStatus.deliveryPaused;
    try { 
      await setDoc(ref, { deliveryPaused: newStatus }, { merge: true }); 
      showToast(`Delivery is now ${newStatus ? "PAUSED" : "ACTIVE"}`, "success");
    } 
    catch (error) { showToast("Failed to change delivery status.", "error"); }
  };

  const toggleStoreStatus = async () => {
    const ref = doc(db, "settings", "storeStatus");
    const newStatus = !storeStatus.storePaused;
    try { 
      await setDoc(ref, { storePaused: newStatus }, { merge: true }); 
      showToast(`Store is now ${newStatus ? "CLOSED" : "OPEN"}`, "success");
    } 
    catch (error) { showToast("Failed to change store status.", "error"); }
  };

  const handleSaveDeliveryConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDeliveryConfig(true);
    try {
      await setDoc(doc(db, "settings", "deliveryConfig"), {
        baseFee: Number(deliveryConfig.baseFee),
        freeAbove: Number(deliveryConfig.freeAbove)
      });
      showToast("Delivery charges updated successfully! 🚚", "success");
    } catch (error) {
      showToast("Failed to update delivery settings.", "error");
    }
    setSavingDeliveryConfig(false);
  };

  const handleSaveTimings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTimings(true);
    try {
      await setDoc(doc(db, "settings", "storeStatus"), {
        autoTimeEnabled: timingConfig.enabled,
        openTime: timingConfig.open,
        closeTime: timingConfig.close
      }, { merge: true });
      showToast("Store operating hours updated successfully! ⏰", "success");
    } catch (error) {
      showToast("Failed to update timings.", "error");
    }
    setSavingTimings(false);
  };

  const sanitizeCSV = (val: any) => {
    let str = String(val ?? "");
    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
    return `"${str.replace(/"/g, '""')}"`;
  };

  const exportSalesToCSV = () => {
    if (orders.length === 0) { showToast("No orders to export!", "error"); return; }
    let csvContent = "Order ID,Date,Status,Type,Customer Name,Phone,Item Total,Delivery Fee,Discount,Promo Code,Payment Method,Total Paid\n";

    orders.forEach((o) => {
      const safeDateStr = o.orderDate?.toDate ? o.orderDate.toDate().toLocaleString('en-IN') : "Unknown";
      const date = safeDateStr.replace(new RegExp(',', 'g'), '');
      const type = o.customerDetails?.orderType || "Delivery";
      const name = sanitizeCSV(o.customerDetails?.name || ""); 
      const phone = sanitizeCSV(o.customerDetails?.phone || "");
      const itemTotal = o.cartTotal || o.totalAmount; 
      const dFee = o.deliveryFee || 0;
      const discount = o.discount || 0;
      const code = sanitizeCSV(o.promoCodeUsed || "None");
      const paymentMethod = sanitizeCSV(o.customerDetails?.paymentMethod || o.paymentMethod || "Cash on Delivery");
      const total = o.totalAmount;
      
      const row = `${o.orderId},${date},${o.status},${type},${name},${phone},${itemTotal},${dFee},${discount},${code},${paymentMethod},${total}`;
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileNameDate = new Date().toLocaleDateString('en-IN').replace(new RegExp('/', 'g'), '-');
    link.setAttribute("download", `Pradeep_Kirana_Sales_${fileNameDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Sales exported successfully!", "success");
  };

  const handleAddCoupon = async (e: any) => {
    e.preventDefault();
    setAddingCoupon(true);
    try {
      const code = String(newCoupon.code || "").trim().toUpperCase();
      const discountAmount = Number(newCoupon.discountAmount);
      const minOrderAmount = Number(newCoupon.minOrderAmount);

      if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
        showToast("Invalid coupon code.", "error");
        return;
      }
      if (!Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount > 100000) {
        showToast("Invalid discount amount.", "error");
        return;
      }
      if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0 || minOrderAmount > 10000000) {
        showToast("Invalid minimum order amount.", "error");
        return;
      }
      await addDoc(collection(db, "coupons"), {
        code,
        discountAmount,
        minOrderAmount,
        active: true,
      });
      setShowCouponModal(false);
      setNewCoupon({ code: "", discountAmount: "", minOrderAmount: "" });
      showToast("Coupon added successfully! 🎉", "success");
    } catch (error) { showToast("Failed to add coupon.", "error"); }
    setAddingCoupon(false);
  };

  // Add Offer Function
  const handleAddOffer = async (e: any) => {
    e.preventDefault(); 
    setAddingOffer(true);
    try {
      await addDoc(collection(db, "offers"), { name: newOffer.name, label: newOffer.label.toUpperCase(), type: newOffer.type, active: true });
      setShowOfferModal(false); 
      setNewOffer({ name: "", label: "", type: "BOGO" });
      showToast("Offer created successfully! 🎁", "success");
    } catch(e) { showToast("Failed to create offer.", "error"); }
    setAddingOffer(false);
  };

  const handleAddProduct = async (e: any) => {
    e.preventDefault(); setAddingProduct(true);
    const finalCategory = isAddingCustomCategory ? customCategoryName : newItem.category;
    const selectedOffer = offers.find(o => o.id === newItem.offerId) || null;

    try {
      await addDoc(collection(db, "items"), { 
        name: newItem.name, 
        category: finalCategory, 
        price: Number(newItem.price), 
        originalPrice: newItem.originalPrice ? Number(newItem.originalPrice) : null,
        stockQuantity: Number(newItem.stockQuantity), 
        unit: newItem.unit, 
        imageUrl: newItem.imageUrl, 
        offerId: selectedOffer ? selectedOffer.id : null,
        offerText: selectedOffer ? selectedOffer.label : "", // Visual badge
        offerType: selectedOffer ? selectedOffer.type : "",   // Math logic (BOGO, etc)
        isAvailable: true 
      });

      setShowAddModal(false); 
      setNewItem({ name: "", category: "Atta & Dal", price: "", originalPrice: "", stockQuantity: "", unit: "", imageUrl: "", offerText: "", offerId: "" });
      setIsAddingCustomCategory(false); setCustomCategoryName(""); 
      showToast("Product Added successfully! 🎉", "success");
    } catch (error) { showToast("Error adding product.", "error"); }
    setAddingProduct(false);
  };

  const handleSaveEdit = async (e: any) => {
    e.preventDefault(); setSavingEdit(true);
    const selectedOffer = offers.find(o => o.id === editingProduct.offerId) || null;

    try {
      await updateDoc(doc(db, "items", editingProduct.id), { 
        name: editingProduct.name, 
        category: editingProduct.category, 
        price: Number(editingProduct.price), 
        originalPrice: editingProduct.originalPrice ? Number(editingProduct.originalPrice) : null,
        stockQuantity: Number(editingProduct.stockQuantity), 
        unit: editingProduct.unit, 
        imageUrl: editingProduct.imageUrl,
        offerId: selectedOffer ? selectedOffer.id : null,
        offerText: selectedOffer ? selectedOffer.label : "",
        offerType: selectedOffer ? selectedOffer.type : "", 
      });

      setShowEditModal(false); setEditingProduct(null); 
      showToast("Updated successfully! ✅", "success");
    } catch (error) { showToast("Error updating.", "error"); }
    setSavingEdit(false);
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"?`)) {
      try { 
        await deleteDoc(doc(db, "items", id)); 
        showToast("Product deleted.", "info");
      } catch (error) { showToast("Error deleting.", "error"); }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Pending": return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-400 dark:border-yellow-800 animate-pulse";
      case "Accepted": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
      case "Out for Delivery": case "Ready for Pickup": return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800";
      case "Awaiting Confirmation": case "Awaiting Pickup Confirmation": return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50 animate-pulse";
      case "Delivered": case "Picked Up": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
      case "Cancelled": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const isDateInFilterRange = (timestamp: any, filter: string) => {
    if (!timestamp || !timestamp.toDate) return false;
    const orderDate = timestamp.toDate();
    const today = new Date();
    if (filter === "This Week") {
      const firstDayOfWeek = new Date(today);
      firstDayOfWeek.setDate(today.getDate() - today.getDay());
      firstDayOfWeek.setHours(0, 0, 0, 0);
      return orderDate >= firstDayOfWeek;
    }
    if (filter === "This Month") return orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear();
    if (filter === "This Year") return orderDate.getFullYear() === today.getFullYear();
    return true;
  };

  const filteredSalesOrders = orders.filter(o => (o.status === "Delivered" || o.status === "Picked Up") && isDateInFilterRange(o.orderDate, salesFilter));
  const totalRevenue = filteredSalesOrders.reduce((acc, o) => acc + o.totalAmount, 0);
  const pendingOrders = orders.filter(o => o.status === "Pending").length;
  const lowStockItems = products.filter(p => p.stockQuantity <= 5);
  const unreadReviewsCount = reviews.filter(r => !viewedReviewIds.has(r.id)).length;

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.orderId?.toLowerCase().includes(orderSearch.toLowerCase()) || o.customerDetails?.name?.toLowerCase().includes(orderSearch.toLowerCase()) || o.customerDetails?.phone?.includes(orderSearch);
    const matchesStatus = orderFilter === "All" || o.status === orderFilter;
    return matchesSearch && matchesStatus;
  });

  const getCustomers = () => {
    const cMap = new Map();
    orders.forEach(o => {
      const phone = o.customerDetails?.phone;
      if (!phone) return;
      if (!cMap.has(phone)) cMap.set(phone, { name: o.customerDetails.name, phone, address: o.customerDetails.address, totalOrders: 0, totalSpent: 0 });
      const c = cMap.get(phone);
      c.totalOrders += 1;
      if (o.status === "Delivered" || o.status === "Picked Up") c.totalSpent += o.totalAmount;
    });
    return Array.from(cMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  };

  // ================= LOGIN RENDER =================
  if (checkingAuth) {
    return <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a] flex items-center justify-center p-4">
        
        {toast.show && (
          <div className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 max-w-md p-4 rounded-2xl shadow-2xl flex items-center justify-between border animate-in slide-in-from-top-5 duration-300 ${
            toast.type === 'error' ? 'bg-red-600 text-white border-red-400' 
            : toast.type === 'success' ? 'bg-green-600 text-white border-green-400'
            : 'bg-blue-600 text-white border-blue-400'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-full shrink-0">
                {toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-90">Notification</p>
                <p className="text-sm font-extrabold leading-tight">{toast.message}</p>
              </div>
            </div>
            <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="p-1 hover:bg-black/20 rounded-full transition shrink-0"><X size={18} /></button>
          </div>
        )}

        <div className="bg-white dark:bg-[#121212] w-full max-w-md p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-300 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={32} />
          </div>
          
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">Secure Admin Gateway</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Authenticate with your authorized Google Account</p>

          {authError && <p className="text-sm font-bold text-red-500 mb-4 animate-in slide-in-from-top-2">{authError}</p>}

          <button onClick={handleAdminLogin} className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3.5 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition flex items-center justify-center gap-2 shadow-md">
            <Lock size={18} /> Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  // ================= MAIN DASHBOARD RENDER =================
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-3 md:p-8 transition-colors duration-300">
      
      {/* GLOBAL TOAST */}
      {toast.show && (
        <div className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 max-w-md p-4 rounded-2xl shadow-2xl flex items-center justify-between border animate-in slide-in-from-top-5 duration-300 ${
          toast.type === 'error' ? 'bg-red-600 text-white border-red-400' 
          : toast.type === 'success' ? 'bg-green-600 text-white border-green-400'
          : 'bg-blue-600 text-white border-blue-400'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full shrink-0">
              {toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Notification</p>
              <p className="text-sm font-extrabold leading-tight">{toast.message}</p>
            </div>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="p-1 hover:bg-black/20 rounded-full transition shrink-0"><X size={18} /></button>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        
        {/* HEADER */}
        <header className="bg-white dark:bg-[#121212] p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-3xl font-extrabold text-gray-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">Manage everything securely</p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            {/* Toggles Row */}
            <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:flex md:gap-3">
              {/* Store Status Toggle */}
              <div className="flex items-center justify-between md:justify-start gap-2 bg-gray-50 dark:bg-[#1a1a1a] p-2 md:px-4 md:py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex flex-col text-left">
                  <span className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase leading-tight">Store Status</span>
                  <span className={`text-[10px] md:text-xs font-extrabold leading-tight ${storeStatus.storePaused ? 'text-red-500' : 'text-green-600'}`}>{storeStatus.storePaused ? "CLOSED 🛑" : "OPEN ✅"}</span>
                </div>
                <button onClick={toggleStoreStatus} className={`relative w-10 md:w-12 h-5 md:h-6 rounded-full transition-colors shrink-0 ${storeStatus.storePaused ? 'bg-red-500' : 'bg-green-600'}`}>
                  <span className={`absolute top-[2px] md:top-1 bg-white w-4 h-4 rounded-full transition-all ${storeStatus.storePaused ? 'left-[2px] md:left-1' : 'left-[22px] md:left-7'}`} />
                </button>
              </div>

              {/* Delivery Toggle */}
              <div className="flex items-center justify-between md:justify-start gap-2 bg-gray-50 dark:bg-[#1a1a1a] p-2 md:px-4 md:py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex flex-col text-left">
                  <span className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase leading-tight">Home Delivery</span>
                  <span className={`text-[10px] md:text-xs font-extrabold leading-tight ${storeStatus.deliveryPaused ? 'text-red-500' : 'text-green-600'}`}>{storeStatus.deliveryPaused ? "PAUSED 🛑" : "ACTIVE ✅"}</span>
                </div>
                <button onClick={toggleDelivery} className={`relative w-10 md:w-12 h-5 md:h-6 rounded-full transition-colors shrink-0 ${storeStatus.deliveryPaused ? 'bg-red-500' : 'bg-green-600'}`}>
                  <span className={`absolute top-[2px] md:top-1 bg-white w-4 h-4 rounded-full transition-all ${storeStatus.deliveryPaused ? 'left-[2px] md:left-1' : 'left-[22px] md:left-7'}`} />
                </button>
              </div>
            </div>

            {/* Buttons Row */}
            <div className="grid grid-cols-1 gap-2 w-full md:w-auto md:flex md:gap-3">
              <button onClick={handleLockOut} className="justify-center text-[10px] md:text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl border border-red-200 dark:border-red-800/40 flex items-center gap-1.5 transition"><Lock size={14} /> Secure Lock</button>
            </div>
          </div>
        </header>

        {/* ANALYTICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-center relative hover:border-green-500 transition">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-1">
              <div className="flex items-center gap-1.5 text-green-600"><TrendingUp size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide">Sales</span></div>
              <select value={salesFilter} onChange={(e) => setSalesFilter(e.target.value as any)} className="text-[9px] md:text-[10px] font-bold bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 outline-none rounded py-0.5 px-1 md:p-1 cursor-pointer w-fit">
                <option value="This Week">This Week</option><option value="This Month">This Month</option><option value="This Year">This Year</option><option value="Total">Total</option>
              </select>
            </div>
            <p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white mt-1">₹{totalRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-center hover:border-blue-500 transition"><div className="flex items-center gap-1.5 text-blue-500 mb-1"><Package size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide">Total Orders</span></div><p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white">{orders.length}</p></div>
          <div className="bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-center hover:border-yellow-500 transition"><div className="flex items-center gap-1.5 text-yellow-600 mb-1"><Clock size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide">Pending</span></div><p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white">{pendingOrders}</p></div>
          <div className={`bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border transition ${lowStockItems.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-800 hover:border-red-500'} flex flex-col justify-center`}><div className="flex items-center gap-1.5 text-red-500 mb-1"><AlertTriangle size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide leading-tight">Low Stock</span></div><p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white">{lowStockItems.length} <span className="text-[10px] md:text-sm text-gray-500 font-medium">items</span></p></div>
        </div>

        {/* TABS */}
        <div className="bg-white dark:bg-[#121212] p-2 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex overflow-x-auto gap-2 w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button onClick={() => setActiveTab("orders")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "orders" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Package size={18} /> Orders</button>
          <button onClick={() => setActiveTab("inventory")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "inventory" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Box size={18} /> Inventory</button>
          <button onClick={() => setActiveTab("customers")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "customers" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Users size={18} /> Customers</button>
          <button onClick={() => setActiveTab("coupons")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "coupons" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Tag size={18} /> Coupons</button>
          {/* 🔴 NEW OFFERS TAB 🔴 */}
          <button onClick={() => setActiveTab("offers")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "offers" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Zap size={18} /> Offers</button>
          <button onClick={() => setActiveTab("settings")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "settings" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Settings size={18} /> Settings</button>
          <button onClick={() => setActiveTab("reviews")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "reviews" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Star size={18} /> Reviews {unreadReviewsCount > 0 && <span className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full">{unreadReviewsCount}</span>}</button>
        </div>

        {/* ================= TAB CONTENTS ================= */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {loading ? (
            <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>
          ) : (
            <>
              {/* ORDERS TAB */}
              {activeTab === "orders" && (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-center">
                      <div className="relative flex-1 w-full"><Search className="absolute left-3 top-3.5 md:top-3 text-gray-400" size={18} /><input type="text" placeholder="Search by Order ID, Name, Phone..." value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 md:py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition" /></div>
                      <div className="relative md:w-48 w-full"><Filter className="absolute left-3 top-3.5 md:top-3 text-gray-400" size={18} /><select value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)} className="w-full pl-10 pr-4 py-3 md:py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 appearance-none transition"><option value="All">All Orders</option><option value="Pending">Pending</option><option value="Accepted">Accepted</option><option value="Out for Delivery">Out for Delivery</option><option value="Ready for Pickup">Ready for Pickup</option><option value="Awaiting Confirmation">Awaiting Confirmation</option><option value="Delivered">Delivered</option><option value="Picked Up">Picked Up</option><option value="Cancelled">Cancelled</option></select></div>
                      <button onClick={exportSalesToCSV} className="w-full md:w-auto bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold px-4 py-3 md:py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center gap-1.5 transition shrink-0 hover:scale-105">
                        <Download size={16} /> Export CSV
                      </button>
                    </div>

                    {filteredOrders.length === 0 ? (
                      <div className="text-center bg-white dark:bg-[#121212] p-10 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800"><Package className="mx-auto text-gray-400 mb-4" size={48} /><h2 className="text-xl font-bold text-gray-700 dark:text-gray-300">No orders found matching criteria.</h2></div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                        {filteredOrders.map((order) => {
                          const isPickup = order.customerDetails?.orderType === "Pickup";
                          const isPending = order.status === "Pending";
                          return (
                            <div key={order.id} className={`rounded-2xl shadow-sm border-2 overflow-hidden flex flex-col transition-all duration-300 hover:shadow-lg ${isPending ? 'border-yellow-500 bg-yellow-50/40 dark:bg-yellow-900/20 shadow-md' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#121212]'}`}>
                              <div className={`p-3 md:p-4 border-b flex justify-between items-start ${isPending ? 'bg-yellow-100/60 dark:bg-yellow-900/40 border-yellow-200 dark:border-yellow-800/50' : 'bg-gray-50 dark:bg-[#1e1e1e] border-gray-200 dark:border-gray-800'}`}>
                                <div>
                                  <div className="flex items-center gap-2"><h3 className="font-extrabold text-base md:text-lg text-gray-900 dark:text-white">{order.orderId || "ORD-OLD"}</h3><span className={`px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold flex items-center gap-1 border ${isPickup ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50'}`}>{isPickup ? <Store size={12}/> : <Truck size={12}/>} {isPickup ? 'STORE PICKUP' : 'HOME DELIVERY'}</span></div>
                                  <p className="text-[11px] md:text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5"><Calendar size={12} className="text-green-600" />{order.orderDate?.toDate ? order.orderDate.toDate().toLocaleString('en-IN') : 'Just now'}</p>
                                </div>
                                <span className={`px-2 md:px-3 py-1 rounded-full text-[10px] md:text-[11px] font-extrabold border ${getStatusColor(order.status)} uppercase tracking-wider text-center`}>{order.status}</span>
                              </div>
                              <div className="p-4 md:p-5 flex-grow">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                  <div className="space-y-2 text-sm">
                                    <p className="font-semibold text-base text-gray-900 dark:text-white">{order.customerDetails?.name}</p>
                                    <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><Phone size={14} /> <a href={`tel:${order.customerDetails?.phone}`} className="hover:text-green-600 font-medium">{order.customerDetails?.phone}</a></p>
                                    {isPickup ? <p className="text-orange-600 dark:text-orange-400 font-medium bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg text-xs border border-orange-100 dark:border-orange-800/30">Customer will pickup from shop.</p> : <p className="flex items-start gap-2 text-gray-600 dark:text-gray-400"><MapPin size={14} className="mt-1 flex-shrink-0" /> <span className="line-clamp-2">{order.customerDetails?.address}</span></p>}
                                  </div>
                                  <div className="flex flex-col justify-start items-start sm:items-end gap-1 sm:gap-2 w-full text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100 dark:border-gray-800">
                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Paid</p>
                                    <p className="text-2xl font-extrabold text-green-600 dark:text-green-500">₹{order.totalAmount}</p>
                                    {order.promoCodeUsed && <p className="text-[10px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded border border-green-200 dark:border-green-800/50 font-bold uppercase mt-1">Promo: {order.promoCodeUsed}</p>}
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase mt-1">Delivery: {order.deliveryFee === 0 ? "FREE" : `₹${order.deliveryFee}`}</p>
                                    <p className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800/50 uppercase mt-1">
                                      💳 {order.customerDetails?.paymentMethod || order.paymentMethod || "Cash on Delivery"}
                                    </p>
                                    {!isPickup && (order.customerDetails?.lat || order.customerDetails?.mapLink) && (
                                      <a 
                                        href={order.customerDetails?.lat ? `https://www.google.com/maps?q=${order.customerDetails.lat},${order.customerDetails.lng}` : order.customerDetails?.mapLink} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-3 py-1.5 w-fit rounded-lg text-sm font-bold border border-blue-200 dark:border-blue-800/50 transition mt-2"
                                      >
                                        <ExternalLink size={14} /> Open Map
                                      </a>
                                    )}
                                  </div>
                                </div>
                                <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-xl p-3 border border-gray-100 dark:border-gray-800 mt-2">
                                  <p className="text-[11px] md:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Order Items</p>
                                  <div className="space-y-1 max-h-32 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">{order.items?.map((item: any, idx: number) => <div key={idx} className="flex justify-between text-xs md:text-sm items-center border-b border-gray-200 dark:border-gray-800 py-1.5 last:border-0"><span className="font-medium text-gray-800 dark:text-gray-200"><span className="font-bold mr-2 text-green-700 dark:text-green-400">{item.cartQuantity}x</span> {item.name}</span><span className="font-semibold text-gray-600 dark:text-gray-400">₹{item.price * item.cartQuantity}</span></div>)}</div>
                                </div>
                              </div>
                              <div className="p-3 md:p-4 bg-gray-50 dark:bg-[#1e1e1e] border-t border-gray-200 dark:border-gray-800 flex flex-wrap gap-2 justify-end items-center">
                                {order.status === "Pending" && <button onClick={() => updateOrderStatus(order.id, "Accepted")} className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-1 transition"><Clock size={16} /> Accept Order</button>}
                                {order.status === "Accepted" && <button onClick={() => updateOrderStatus(order.id, isPickup ? "Ready for Pickup" : "Out for Delivery")} className="w-full sm:w-auto justify-center bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-1 transition">{isPickup ? <Store size={16}/> : <Bike size={16}/>} {isPickup ? "Ready for Pickup" : "Out for Delivery"}</button>}
                                
                                {order.status === "Out for Delivery" && (
                                  <button onClick={() => updateOrderStatus(order.id, "Awaiting Confirmation")} className="w-full sm:w-auto justify-center bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-1 transition">
                                    <CheckCircle size={16} /> Delivery Done (Ask Customer)
                                  </button>
                                )}

                                {order.status === "Ready for Pickup" && (
                                  <button onClick={() => updateOrderStatus(order.id, "Awaiting Pickup Confirmation")} className="w-full sm:w-auto justify-center bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-1 transition">
                                    <Store size={16} /> Handed Over (Ask Customer)
                                  </button>
                                )}

                                {(order.status === "Awaiting Confirmation" || order.status === "Awaiting Pickup Confirmation") && (
                                  <div className="flex items-center justify-center w-full sm:w-auto gap-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-3 py-2.5 rounded-lg text-[11px] md:text-xs font-bold border border-yellow-200 dark:border-yellow-800/50">
                                    <Clock size={14} className="animate-spin shrink-0" /> <span className="text-center">Waiting for Customer to Confirm...</span>
                                  </div>
                                )}

                                {(order.status === "Delivered" || order.status === "Picked Up") && (
                                  <div className="flex items-center justify-center w-full sm:w-auto gap-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-2.5 rounded-lg text-xs font-bold border border-green-200 dark:border-green-800/50">
                                    <CheckCircle size={14} className="shrink-0" /> Confirmed by Customer ✅
                                  </div>
                                )}

                                {["Pending", "Accepted"].includes(order.status) && (
                                  <button onClick={() => handleOpenCancelModal(order.id)} className="w-full sm:w-auto text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2.5 rounded-lg text-sm font-bold transition">
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
              )}

              {/* INVENTORY TAB */}
              {activeTab === "inventory" && (
                <div className="bg-white dark:bg-[#121212] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex flex-col md:flex-row justify-between items-center gap-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Box size={20} className="text-green-600" /> Live Inventory</h2>
                    <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
                      <div className="relative w-full md:w-64"><Search className="absolute left-3 top-2.5 text-gray-400" size={18} /><input type="text" placeholder="Search product..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#121212] text-gray-900 dark:text-white rounded-lg py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-green-500 outline-none transition" /></div>
                      <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-bold shrink-0 transition hover:scale-105"><Plus size={16} /> <span className="hidden md:inline">Add Product</span><span className="md:hidden">Add</span></button>
                    </div>
                  </div>
                  
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map((product) => {
                      const isLowStock = product.stockQuantity <= 5;
                      return (
                        <div key={product.id} className={`p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition ${isLowStock ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                          <div className="flex gap-3 md:gap-4 items-center w-full md:w-auto">
                            <div className="w-14 h-14 md:w-16 md:h-16 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center font-bold text-gray-500 border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0 shadow-sm">
                              {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" /> : product.name.charAt(0)}
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-1.5 md:gap-2 text-sm md:text-base">
                                {product.name} 
                                {isLowStock && <span className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded font-extrabold border border-red-200 dark:border-red-800/50 flex items-center gap-1 animate-pulse"><AlertTriangle size={10} /> Low Stock</span>}
                              </h3>
                              <p className="text-[11px] md:text-sm text-gray-500 dark:text-gray-400">{product.category} • {product.unit}</p>
                              <div className="flex items-center gap-2 mt-0.5 md:mt-1">
                                <p className="font-bold text-green-600 dark:text-green-500 text-sm md:text-base">₹{product.price}</p>
                                {product.originalPrice && product.originalPrice > product.price && (
                                  <p className="text-[10px] md:text-xs text-gray-400 line-through font-semibold">₹{product.originalPrice}</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t border-gray-100 md:border-t-0 dark:border-gray-800">
                            <div className="flex flex-col items-start md:items-end">
                              <p className="text-[9px] md:text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">Quick Stock Update</p>
                              <StockEditor item={product} showToast={showToast} />
                            </div>
                            <div className="flex gap-1 md:gap-2 border-l border-gray-200 dark:border-gray-700 pl-3 md:pl-4 ml-1 md:ml-2">
                              <button onClick={() => { setEditingProduct(product); setShowEditModal(true); }} className="p-1.5 md:p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition border border-transparent hover:border-blue-200 dark:hover:border-blue-800/50"><Pencil size={18} /></button>
                              <button onClick={() => handleDeleteProduct(product.id, product.name)} className="p-1.5 md:p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition border border-transparent hover:border-red-200 dark:hover:border-red-800/50"><Trash2 size={18} /></button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* CUSTOMERS TAB */}
              {activeTab === "customers" && (
                <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                  <div className="mb-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Users className="text-blue-500" size={20} /> Store Customers ({getCustomers().length})</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getCustomers().map((cust, idx) => (
                      <div key={idx} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col transition hover:shadow-md hover:border-blue-500/30">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full flex items-center justify-center font-bold text-lg shrink-0">{cust.name.charAt(0)}</div>
                          <div><p className="font-bold text-gray-900 dark:text-white leading-tight">{cust.name}</p><p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1"><Phone size={10} /> {cust.phone}</p></div>
                        </div>
                        <div className="mb-4"><p className="text-[10px] md:text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Address</p><p className="text-xs md:text-sm font-medium text-gray-800 dark:text-gray-300 line-clamp-2 mt-0.5">{cust.address}</p></div>
                        <div className="mt-auto grid grid-cols-2 gap-2 bg-white dark:bg-[#121212] p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                          <div><p className="text-[9px] md:text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">Total Orders</p><p className="text-base md:text-lg font-extrabold text-blue-600 dark:text-blue-500">{cust.totalOrders}</p></div>
                          <div><p className="text-[9px] md:text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">Total Spent</p><p className="text-base md:text-lg font-extrabold text-green-600 dark:text-green-500">₹{cust.totalSpent}</p></div>
                        </div>
                        <a href={`https://wa.me/91${cust.phone}`} target="_blank" rel="noreferrer" className="mt-3 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition"><MessageCircle size={14} /> WhatsApp Customer</a>
                      </div>
                    ))}
                    {getCustomers().length === 0 && <p className="text-gray-500 dark:text-gray-400 col-span-3 text-center p-8">No customers found.</p>}
                  </div>
                </div>
              )}

              {/* SETTINGS TAB */}
              {activeTab === "settings" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {/* Delivery Settings */}
                  <div className="bg-white dark:bg-[#121212] p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3 md:mb-4">
                      <Truck className="text-blue-500" size={22} /> Delivery Charges
                    </h2>
                    <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400 mb-5 md:mb-6 leading-relaxed">
                      Set the default delivery fee and the minimum cart order amount for free delivery.
                    </p>
                    <form onSubmit={handleSaveDeliveryConfig} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Base Delivery Fee (₹)</label>
                        <input required type="number" min="0" value={deliveryConfig.baseFee} onChange={(e) => setDeliveryConfig({...deliveryConfig, baseFee: Number(e.target.value)})} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500 transition" />
                        <p className="text-[10px] text-gray-400 mt-1">Charge applied when order is below the minimum threshold.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Free Delivery Threshold (₹)</label>
                        <input required type="number" min="0" value={deliveryConfig.freeAbove} onChange={(e) => setDeliveryConfig({...deliveryConfig, freeAbove: Number(e.target.value)})} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500 transition" />
                        <p className="text-[10px] text-gray-400 mt-1">Orders equal or above this amount get free delivery.</p>
                      </div>
                      <button type="submit" disabled={savingDeliveryConfig} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-md mt-2 flex justify-center items-center gap-2 hover:scale-[1.02]">
                        {savingDeliveryConfig ? "Saving..." : "Save Delivery Settings"}
                      </button>
                    </form>
                  </div>

                  {/* Store Operating Hours */}
                  <div className="bg-white dark:bg-[#121212] p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3 md:mb-4">
                      <Clock className="text-green-600" size={22} /> Store Timings (Auto-Status)
                    </h2>
                    <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400 mb-5 md:mb-6 leading-relaxed">
                      Enable this to automatically manage store open/close status based on time. (Frontend logic will use these hours).
                    </p>
                    
                    <form onSubmit={handleSaveTimings} className="space-y-4">
                      <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#1a1a1a]">
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Enable Auto-Timings</p>
                          <p className="text-[10px] text-gray-500">Turn on/off automatically</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={timingConfig.enabled} onChange={(e) => setTimingConfig({...timingConfig, enabled: e.target.checked})} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                        </label>
                      </div>

                      <div className={`transition-opacity duration-300 ${!timingConfig.enabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Opening Time</label>
                            <input required type="time" value={timingConfig.open} onChange={(e) => setTimingConfig({...timingConfig, open: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-green-500 transition" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Closing Time</label>
                            <input required type="time" value={timingConfig.close} onChange={(e) => setTimingConfig({...timingConfig, close: e.target.value})} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-green-500 transition" />
                          </div>
                        </div>
                      </div>

                      <button type="submit" disabled={savingTimings} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition shadow-md mt-2 flex justify-center items-center gap-2 hover:scale-[1.02]">
                        {savingTimings ? "Saving..." : "Save Timings"}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* REVIEWS TAB */}
              {activeTab === "reviews" && (
                <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                  <div className="mb-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Star className="text-yellow-500 fill-current" size={20} /> Customer Reviews</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reviews.map((rev) => (
                      <div key={rev.id} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-3 transition hover:shadow-md">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white text-sm md:text-base">{rev.customerName}</p>
                            <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400">{rev.createdAt?.toDate ? rev.createdAt.toDate().toLocaleString('en-IN') : 'Just now'}</p>
                          </div>
                          <div className="flex items-center gap-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500 px-2 py-1 rounded-lg text-xs font-bold shadow-sm border border-yellow-200 dark:border-yellow-800/50">
                            {rev.rating} <Star size={12} className="fill-current" />
                          </div>
                        </div>
                        <div className="bg-white dark:bg-[#121212] p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-bold text-green-600 dark:text-green-500 mb-1">{rev.productName}</p>
                          <p className="text-xs md:text-sm text-gray-700 dark:text-gray-300 italic">"{rev.reviewText || "No written review provided."}"</p>
                        </div>
                        <button onClick={async () => { 
                          if(window.confirm("Delete this review?")) {
                            await deleteDoc(doc(db, "reviews", rev.id)); 
                            showToast("Review deleted.", "info");
                          }
                        }} className="mt-auto self-end flex items-center gap-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-bold transition">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    ))}
                    {reviews.length === 0 && <p className="text-gray-500 dark:text-gray-400 col-span-2 text-center p-8">No reviews yet.</p>}
                  </div>
                </div>
              )}

              {/* COUPONS TAB */}
              {activeTab === "coupons" && (
                <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                  <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4 gap-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Tag className="text-blue-500" size={20} /> Promo Codes / Coupons</h2>
                    <button onClick={() => setShowCouponModal(true)} className="flex items-center justify-center w-full sm:w-auto gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 sm:py-2 rounded-lg text-sm font-bold shrink-0 transition hover:scale-105"><Plus size={16} /> Create Coupon</button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {coupons.map((coupon) => (
                      <div key={coupon.id} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-blue-500 shadow-sm flex flex-col transition hover:shadow-md">
                        <div className="flex justify-between items-start mb-4">
                          <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 font-black tracking-widest px-3 py-1 rounded border border-blue-200 dark:border-blue-800/50 uppercase text-base md:text-lg">
                            {coupon.code}
                          </div>
                          <button onClick={async () => { 
                            if(window.confirm("Delete this coupon?")) {
                              await deleteDoc(doc(db, "coupons", coupon.id));
                              showToast("Coupon deleted.", "info");
                            } 
                          }} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={18} /></button>
                        </div>
                        <div className="mt-auto space-y-1">
                          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 font-medium">Discount: <span className="font-bold text-green-600 dark:text-green-500">₹{coupon.discountAmount}</span></p>
                          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 font-medium">Min Order: <span className="font-bold text-gray-900 dark:text-white">₹{coupon.minOrderAmount}</span></p>
                        </div>
                      </div>
                    ))}
                    {coupons.length === 0 && <p className="text-gray-500 dark:text-gray-400 col-span-3 text-center p-8">No active coupons. Create one to boost sales!</p>}
                  </div>
                </div>
              )}

              {/* 🔴 NEW OFFERS TAB 🔴 */}
              {activeTab === "offers" && (
                <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                  <div className="mb-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Zap className="text-yellow-500" size={20} /> Product Offers (BOGO)</h2>
                    <button onClick={() => setShowOfferModal(true)} className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-bold transition"><Plus size={16} /> Create Offer</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {offers.map((offer) => (
                      <div key={offer.id} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-yellow-500 shadow-sm flex flex-col transition hover:shadow-md">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-gray-900 dark:text-white">{offer.name}</h3>
                          <button onClick={async () => { 
                            if(window.confirm("Delete this offer? Products using this may not calculate discount properly.")) { 
                              await deleteDoc(doc(db, "offers", offer.id)); 
                              showToast("Offer deleted.", "info"); 
                            } 
                          }} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={18}/></button>
                        </div>
                        <div className="mt-auto space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Badge Text: <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded font-black tracking-wider text-[10px] ml-1">{offer.label}</span></p>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Math Logic: <span className="font-bold text-gray-900 dark:text-white">{offer.type === "BOGO" ? "Buy 1 Get 1 Free" : "Buy 2 Get 1 Free"}</span></p>
                        </div>
                      </div>
                    ))}
                    {offers.length === 0 && <p className="text-gray-500 dark:text-gray-400 col-span-3 text-center p-8">No offers created yet.</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ================= CANCELLATION REASON MODAL ================= */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-500" /> Cancel Order
              </h2>
              <button onClick={() => setShowCancelModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 md:p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Cancellation Reason (Optional)</label>
                <textarea 
                  placeholder="e.g. Item out of stock, store closing, etc." 
                  value={cancellationReason} 
                  onChange={(e) => setCancellationReason(e.target.value)} 
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-500 transition resize-none" 
                  rows={3}
                  autoFocus
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowCancelModal(false)} 
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold py-3 rounded-xl transition"
                >
                  Close
                </button>
                <button 
                  type="button" 
                  onClick={handleConfirmCancel} 
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition shadow-md"
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADD PRODUCT MODAL ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Plus size={20} className="text-green-600" /> Add Product</h2>
              <button onClick={() => { setShowAddModal(false); setIsAddingCustomCategory(false); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddProduct} className="p-4 md:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Image Link</label>
                <div className="relative">
                  <Link className="absolute left-3 top-3.5 text-gray-400" size={16} />
                  <input type="url" placeholder="Paste image URL here..." className="w-full border border-gray-300 dark:border-gray-700 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.imageUrl} onChange={(e) => setNewItem({...newItem, imageUrl: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Name</label>
                <input required type="text" placeholder="e.g. Aashirvaad Atta" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Selling Price (₹)</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.price} onChange={(e) => setNewItem({...newItem, price: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Original Price (₹)</label>
                  <input type="number" min="0" placeholder="Optional MRP" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.originalPrice} onChange={(e) => setNewItem({...newItem, originalPrice: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Stock</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.stockQuantity} onChange={(e) => setNewItem({...newItem, stockQuantity: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Unit Size</label>
                  <input required type="text" placeholder="e.g. 5 kg" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.unit} onChange={(e) => setNewItem({...newItem, unit: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Category</label>
                  {isAddingCustomCategory ? (
                    <div className="relative animate-in fade-in slide-in-from-left-2">
                      <input required type="text" placeholder="Custom" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none pr-8 transition" value={customCategoryName} onChange={(e) => setCustomCategoryName(e.target.value)} autoFocus />
                      <button type="button" onClick={() => setIsAddingCustomCategory(false)} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"><X size={16} /></button>
                    </div>
                  ) : (
                    <select className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.category} onChange={(e) => { if (e.target.value === "+ Add New Category") setIsAddingCustomCategory(true); else setNewItem({...newItem, category: e.target.value}); }}>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                {/* 🔴 NEW: SELECT OFFER DROPDOWN 🔴 */}
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Apply BOGO Offer</label>
                  <select className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition" value={newItem.offerId} onChange={(e) => setNewItem({...newItem, offerId: e.target.value})}>
                    <option value="">No Offer</option>
                    {offers.map(o => <option key={o.id} value={o.id}>{o.name} ({o.label})</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={addingProduct} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg mt-2 transition flex justify-center">{addingProduct ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Save Product"}</button>
            </form>
          </div>
        </div>
      )}

      {/* ================= EDIT PRODUCT MODAL ================= */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Pencil size={20} className="text-blue-500" /> Edit Product</h2>
              <button onClick={() => { setShowEditModal(false); setEditingProduct(null); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-4 md:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Image Link</label>
                <div className="relative">
                  <Link className="absolute left-3 top-3.5 text-gray-400" size={16} />
                  <input type="url" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.imageUrl || ""} onChange={(e) => setEditingProduct({...editingProduct, imageUrl: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Name</label>
                <input required type="text" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.name} onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Selling Price (₹)</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.price} onChange={(e) => setEditingProduct({...editingProduct, price: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Original Price (₹)</label>
                  <input type="number" min="0" placeholder="Optional MRP" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.originalPrice || ""} onChange={(e) => setEditingProduct({...editingProduct, originalPrice: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Stock</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.stockQuantity} onChange={(e) => setEditingProduct({...editingProduct, stockQuantity: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Unit Size</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.unit} onChange={(e) => setEditingProduct({...editingProduct, unit: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Category</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.category} onChange={(e) => setEditingProduct({...editingProduct, category: e.target.value})} />
                </div>
                {/* 🔴 NEW: EDIT OFFER DROPDOWN 🔴 */}
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Apply BOGO Offer</label>
                  <select className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 font-bold focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.offerId || ""} onChange={(e) => setEditingProduct({...editingProduct, offerId: e.target.value})}>
                    <option value="">No Offer</option>
                    {offers.map(o => <option key={o.id} value={o.id}>{o.name} ({o.label})</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={savingEdit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-2 transition flex justify-center">{savingEdit ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Save Changes"}</button>
            </form>
          </div>
        </div>
      )}

      {/* ================= ADD COUPON MODAL ================= */}
      {showCouponModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Tag size={20} className="text-blue-500" /> Create Promo Code</h2>
              <button onClick={() => setShowCouponModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddCoupon} className="p-4 md:p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Coupon Code</label>
                <input required type="text" placeholder="e.g. DIWALI50" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 uppercase transition" value={newCoupon.code} onChange={(e) => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Discount Amount (₹)</label>
                <input required type="number" min="1" placeholder="e.g. 50" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition" value={newCoupon.discountAmount} onChange={(e) => setNewCoupon({...newCoupon, discountAmount: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Minimum Order Amount (₹)</label>
                <input required type="number" min="0" placeholder="e.g. 500" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition" value={newCoupon.minOrderAmount} onChange={(e) => setNewCoupon({...newCoupon, minOrderAmount: e.target.value})} />
              </div>
              <button type="submit" disabled={addingCoupon} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-2 transition flex justify-center">{addingCoupon ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Create Coupon"}</button>
            </form>
          </div>
        </div>
      )}

      {/* ================= ADD OFFER MODAL (NEW) ================= */}
      {showOfferModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-300">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Zap size={20} className="text-yellow-500" /> Create Offer Rule</h2>
              <button onClick={() => setShowOfferModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddOffer} className="p-4 md:p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Offer Name (Internal)</label>
                <input required type="text" placeholder="e.g. Diwali BOGO Sale" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-yellow-500 transition" value={newOffer.name} onChange={(e) => setNewOffer({...newOffer, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Public Badge Text</label>
                <input required type="text" placeholder="e.g. BUY 1 GET 1" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-yellow-500 uppercase transition" value={newOffer.label} onChange={(e) => setNewOffer({...newOffer, label: e.target.value.toUpperCase()})} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Mathematical Logic</label>
                <select className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-yellow-500 transition" value={newOffer.type} onChange={(e) => setNewOffer({...newOffer, type: e.target.value})}>
                  <option value="BOGO">Buy 1 Get 1 Free</option>
                  <option value="B2G1">Buy 2 Get 1 Free</option>
                </select>
              </div>
              <button type="submit" disabled={addingOffer} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg mt-2 transition flex justify-center">{addingOffer ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Create Offer"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}