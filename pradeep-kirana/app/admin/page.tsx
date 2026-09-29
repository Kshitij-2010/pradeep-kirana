"use client";

import { useEffect, useState, useRef } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MapPin, Phone, ExternalLink, Package, Clock, CheckCircle, Bike, Box, Search, Save, Plus, X, Trash2, Link, Pencil, Calendar, CreditCard, Store, Truck, Lock, Key, TrendingUp, AlertTriangle, Users, Filter, MessageCircle, Star, Tag, Download, Settings, Power } from "lucide-react";

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

const StockEditor = ({ item }: { item: any }) => {
  const [stock, setStock] = useState(item.stockQuantity);
  const [saving, setSaving] = useState(false);
  const handleUpdate = async () => {
    setSaving(true);
    try { await updateDoc(doc(db, "items", item.id), { stockQuantity: Number(stock) }); } catch (error) { alert("Failed!"); }
    setSaving(false);
  };
  const isChanged = Number(stock) !== item.stockQuantity;

  return (
    <div className="flex items-center gap-2">
      <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-16 md:w-20 p-1.5 md:p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white text-center font-bold focus:ring-2 focus:ring-green-500 outline-none transition text-sm md:text-base" />
      {isChanged && <button onClick={handleUpdate} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white p-1.5 md:p-2 rounded-lg transition">{saving ? <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}</button>}
    </div>
  );
};

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [verifying, setVerifying] = useState(false);

  // ================= AUTO-LOCK TIMER STATE =================
  const [timeLeft, setTimeLeft] = useState<number>(10800); // 3 hours in seconds

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  // ================= CANCELLATION MODAL STATE =================
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const [activeTab, setActiveTab] = useState<"orders" | "inventory" | "customers" | "reviews" | "coupons" | "settings">("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [viewedReviewIds, setViewedReviewIds] = useState<Set<string>>(new Set());
  const [salesFilter, setSalesFilter] = useState<"This Week" | "This Month" | "This Year" | "Total">("Total");
  
  // Store Status includes both Delivery and Main Store switch
  const [storeStatus, setStoreStatus] = useState({ deliveryPaused: false, storePaused: false, autoTimeEnabled: false, openTime: "09:00", closeTime: "21:00" });
  
  const [deliveryConfig, setDeliveryConfig] = useState({ baseFee: 20, freeAbove: 300 });
  const [savingDeliveryConfig, setSavingDeliveryConfig] = useState(false);
  
  // Timings Config State
  const [timingConfig, setTimingConfig] = useState({ enabled: false, open: "09:00", close: "21:00" });
  const [savingTimings, setSavingTimings] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "Atta & Dal", price: "", stockQuantity: "", unit: "", imageUrl: "" });
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [showCouponModal, setShowCouponModal] = useState(false);
  const [newCoupon, setNewCoupon] = useState({ code: "", discountAmount: "", minOrderAmount: "" });
  const [addingCoupon, setAddingCoupon] = useState(false);

  const isFirstLoad = useRef(true);
  const categories = ["Atta & Dal", "Snacks", "Dairy", "Spices", "Drinks", "+ Add New Category"];

  useEffect(() => {
    if (sessionStorage.getItem("pradeep_admin_auth") === "true") {
      setIsAuthenticated(true);
    }
    const storedViewedReviews = localStorage.getItem("pradeep_viewed_reviews");
    if (storedViewedReviews) {
      try { setViewedReviewIds(new Set(JSON.parse(storedViewedReviews))); } catch (e) {}
    }
  }, []);

  // ================= AUTO-LOCK TIMER EFFECT =================
  useEffect(() => {
    if (!isAuthenticated) return;

    const storedExpiry = sessionStorage.getItem("pradeep_admin_expiry");
    const now = Date.now();
    let expiryTime: number;

    if (storedExpiry) {
      expiryTime = Number(storedExpiry);
      if (expiryTime <= now) {
        handleLockOut();
        return;
      }
    } else {
      expiryTime = now + 3 * 60 * 60 * 1000; // 3 hours from now
      sessionStorage.setItem("pradeep_admin_expiry", expiryTime.toString());
    }

    const timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        handleLockOut();
        clearInterval(timerInterval);
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [isAuthenticated]);

  const handleLockOut = () => {
    sessionStorage.removeItem("pradeep_admin_auth");
    sessionStorage.removeItem("pradeep_admin_expiry");
    setIsAuthenticated(false);
    alert("Admin session expired. Panel has been locked for security. 🔒");
  };

  const handleAddTime = (seconds: number) => {
    const storedExpiry = sessionStorage.getItem("pradeep_admin_expiry");
    const currentExpiry = storedExpiry ? Number(storedExpiry) : Date.now();
    const newExpiry = Math.max(Date.now(), currentExpiry) + seconds * 1000;
    sessionStorage.setItem("pradeep_admin_expiry", newExpiry.toString());
    setTimeLeft(Math.floor((newExpiry - Date.now()) / 1000));
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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

    return () => { unsubOrders(); unsubProducts(); unsubReviews(); unsubCoupons(); unsubStoreStatus(); unsubDeliveryConfig(); };
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeTab === "reviews" && reviews.length > 0) {
      const allIds = reviews.map(r => r.id);
      const newSet = new Set([...Array.from(viewedReviewIds), ...allIds]);
      setViewedReviewIds(newSet);
      localStorage.setItem("pradeep_viewed_reviews", JSON.stringify(Array.from(newSet)));
    }
  }, [activeTab, reviews]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setVerifying(true);
    try {
      const adminDocRef = doc(db, "settings", "admin");
      const adminSnap = await getDoc(adminDocRef);
      const correctPassword = adminSnap.exists() ? adminSnap.data().passcode : "admin123";
      if (!adminSnap.exists()) await setDoc(adminDocRef, { passcode: "admin123" });
      if (passwordInput === correctPassword) {
        setIsAuthenticated(true);
        sessionStorage.setItem("pradeep_admin_auth", "true");
        sessionStorage.setItem("pradeep_admin_expiry", (Date.now() + 3 * 60 * 60 * 1000).toString());
      } else { alert("Incorrect Password! ❌"); setPasswordInput(""); }
    } catch (error) { alert("Auth failed."); }
    setVerifying(false);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return alert("Passwords do not match! ❌");
    setChangingPass(true);
    try {
      const adminDocRef = doc(db, "settings", "admin");
      const adminSnap = await getDoc(adminDocRef);
      if (oldPassword !== (adminSnap.exists() ? adminSnap.data().passcode : "admin123")) {
        setChangingPass(false); return alert("Incorrect Old Password! ❌");
      }
      await updateDoc(adminDocRef, { passcode: newPassword });
      alert("Password updated! Please login again.");
      sessionStorage.removeItem("pradeep_admin_auth");
      sessionStorage.removeItem("pradeep_admin_expiry");
      setIsAuthenticated(false);
      setShowPasswordModal(false); setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (error) { alert("Failed to update."); }
    setChangingPass(false);
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const orderSnap = await getDoc(orderRef);

      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        const oldStatus = orderData.status;

        if (oldStatus !== "Cancelled" && newStatus === "Cancelled") {
          const items = orderData.items || [];
          const restorePromises = items.map((item: any) => {
            const itemRef = doc(db, "items", item.id);
            return updateDoc(itemRef, {
              stockQuantity: increment(item.cartQuantity)
            });
          });
          await Promise.all(restorePromises);
        }
      }

      await updateDoc(orderRef, { status: newStatus });
      alert(`Order status updated to "${newStatus}" successfully! ✅`);
    } catch (error) { 
      console.error("Failed to update order status:", error);
      alert("Update failed."); 
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
      const orderRef = doc(db, "orders", cancellingOrderId);
      const orderSnap = await getDoc(orderRef);

      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        const oldStatus = orderData.status;

        if (oldStatus !== "Cancelled") {
          const items = orderData.items || [];
          const restorePromises = items.map((item: any) => {
            const itemRef = doc(db, "items", item.id);
            return updateDoc(itemRef, {
              stockQuantity: increment(item.cartQuantity)
            });
          });
          await Promise.all(restorePromises);
        }
      }

      await updateDoc(orderRef, {
        status: "Cancelled",
        cancellationReason: cancellationReason.trim()
      });

      setShowCancelModal(false);
      setCancellingOrderId(null);
      setCancellationReason("");
      alert("Order cancelled successfully! ✅");
    } catch (error) {
      console.error("Failed to cancel order:", error);
      alert("Failed to cancel order.");
    }
  };

  const toggleDelivery = async () => {
    const ref = doc(db, "settings", "storeStatus");
    const newStatus = !storeStatus.deliveryPaused;
    try { await setDoc(ref, { deliveryPaused: newStatus }, { merge: true }); } 
    catch (error) { alert("Failed to change delivery status."); }
  };

  const toggleStoreStatus = async () => {
    const ref = doc(db, "settings", "storeStatus");
    const newStatus = !storeStatus.storePaused;
    try { await setDoc(ref, { storePaused: newStatus }, { merge: true }); } 
    catch (error) { alert("Failed to change store status."); }
  };

  const handleSaveDeliveryConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDeliveryConfig(true);
    try {
      await setDoc(doc(db, "settings", "deliveryConfig"), {
        baseFee: Number(deliveryConfig.baseFee),
        freeAbove: Number(deliveryConfig.freeAbove)
      });
      alert("Delivery charges updated successfully! 🚚");
    } catch (error) {
      alert("Failed to update delivery settings.");
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
      alert("Store operating hours updated successfully! ⏰");
    } catch (error) {
      alert("Failed to update timings.");
    }
    setSavingTimings(false);
  };

  const exportSalesToCSV = () => {
    if (orders.length === 0) { alert("No orders to export!"); return; }
    
    let csvContent = "Order ID,Date,Status,Type,Customer Name,Phone,Item Total,Delivery Fee,Discount,Promo Code,Payment Method,Total Paid\n";

    orders.forEach((o) => {
      const safeDateStr = o.orderDate?.toDate ? o.orderDate.toDate().toLocaleString('en-IN') : "Unknown";
      const date = safeDateStr.replace(new RegExp(',', 'g'), '');
      
      const type = o.customerDetails?.orderType || "Delivery";
      const name = `"${o.customerDetails?.name || ""}"`; 
      const itemTotal = o.cartTotal || o.totalAmount; 
      const dFee = o.deliveryFee || 0;
      const discount = o.discount || 0;
      const code = o.promoCodeUsed || "None";
      const paymentMethod = o.customerDetails?.paymentMethod || o.paymentMethod || "Cash on Delivery";
      const total = o.totalAmount;
      
      const row = `${o.orderId},${date},${o.status},${type},${name},${o.customerDetails?.phone},${itemTotal},${dFee},${discount},${code},${paymentMethod},${total}`;
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
  };

  const handleAddCoupon = async (e: any) => {
    e.preventDefault();
    setAddingCoupon(true);
    try {
      await addDoc(collection(db, "coupons"), {
        code: newCoupon.code.toUpperCase(),
        discountAmount: Number(newCoupon.discountAmount),
        minOrderAmount: Number(newCoupon.minOrderAmount),
      });
      setShowCouponModal(false);
      setNewCoupon({ code: "", discountAmount: "", minOrderAmount: "" });
      alert("Coupon added successfully! 🎉");
    } catch (error) { alert("Failed to add coupon."); }
    setAddingCoupon(false);
  };

  const handleAddProduct = async (e: any) => {
    e.preventDefault(); setAddingProduct(true);
    const finalCategory = isAddingCustomCategory ? customCategoryName : newItem.category;
    try {
      await addDoc(collection(db, "items"), { name: newItem.name, category: finalCategory, price: Number(newItem.price), stockQuantity: Number(newItem.stockQuantity), unit: newItem.unit, imageUrl: newItem.imageUrl, isAvailable: true });
      setShowAddModal(false); setNewItem({ name: "", category: "Atta & Dal", price: "", stockQuantity: "", unit: "", imageUrl: "" });
      setIsAddingCustomCategory(false); setCustomCategoryName(""); alert("Added successfully! 🎉");
    } catch (error) { alert("Error adding."); }
    setAddingProduct(false);
  };

  const handleSaveEdit = async (e: any) => {
    e.preventDefault(); setSavingEdit(true);
    try {
      await updateDoc(doc(db, "items", editingProduct.id), { name: editingProduct.name, category: editingProduct.category, price: Number(editingProduct.price), stockQuantity: Number(editingProduct.stockQuantity), unit: editingProduct.unit, imageUrl: editingProduct.imageUrl });
      setShowEditModal(false); setEditingProduct(null); alert("Updated successfully! ✅");
    } catch (error) { alert("Error updating."); }
    setSavingEdit(false);
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"?`)) {
      try { await deleteDoc(doc(db, "items", id)); } catch (error) { alert("Error deleting."); }
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#121212] p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in">
          <Lock className="mx-auto text-green-600 mb-4" size={32} />
          <h1 className="text-2xl font-extrabold text-center text-gray-900 dark:text-white mb-6">Admin Restricted</h1>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input type="password" placeholder="Enter Admin Password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full p-3.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white text-center font-bold tracking-widest outline-none focus:ring-2 focus:ring-green-500 transition" required autoFocus />
            <button type="submit" disabled={verifying} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition">{verifying ? "Verifying..." : "Unlock Admin Panel"}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-3 md:p-8 transition-colors duration-300">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        
        {/* ================= AUTO-LOCK TIMER BANNER AT THE TOP ================= */}
        <div className="bg-amber-500 text-slate-950 px-4 md:px-5 py-2.5 md:py-3 rounded-2xl shadow-md flex flex-col sm:flex-row items-center justify-between gap-3 font-bold text-sm">
          <div className="flex items-center gap-2">
            <Clock size={18} className="animate-spin" />
            <span className="text-xs md:text-sm">Auto-Lock in: <span className="font-extrabold tracking-wider bg-slate-950 text-white px-2 py-0.5 md:px-2.5 md:py-1 rounded-lg ml-1">{formatTime(timeLeft)}</span></span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wide opacity-80 hidden sm:inline">Add Time:</span>
            <button onClick={() => handleAddTime(1800)} className="bg-slate-950 text-white hover:bg-slate-800 px-3 py-1.5 rounded-xl text-xs transition shadow-sm">+30 Min</button>
            <button onClick={() => handleAddTime(3600)} className="bg-slate-950 text-white hover:bg-slate-800 px-3 py-1.5 rounded-xl text-xs transition shadow-sm">+1 Hour</button>
          </div>
        </div>

        {/* HEADER (Redesigned for Mobile Space Saving) */}
        <header className="bg-white dark:bg-[#121212] p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-3xl font-extrabold text-gray-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">Manage everything from one place</p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            {/* Toggles Row (2 columns on mobile) */}
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

            {/* Buttons Row (2 columns on mobile) */}
            <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:flex md:gap-3">
              <button onClick={() => setShowPasswordModal(true)} className="justify-center text-[10px] md:text-xs bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl border border-blue-200 dark:border-blue-800/40 flex items-center gap-1.5 transition"><Key size={14} /> Change Pass</button>
              <button onClick={() => { sessionStorage.removeItem("pradeep_admin_auth"); sessionStorage.removeItem("pradeep_admin_expiry"); setIsAuthenticated(false); }} className="justify-center text-[10px] md:text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl border border-red-200 dark:border-red-800/40 flex items-center gap-1.5 transition"><Lock size={14} /> Lock Panel</button>
            </div>
          </div>
        </header>

        {/* ANALYTICS (2x2 Grid on Mobile to save space) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-center relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-1">
              <div className="flex items-center gap-1.5 text-green-600"><TrendingUp size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide">Sales</span></div>
              <select value={salesFilter} onChange={(e) => setSalesFilter(e.target.value as any)} className="text-[9px] md:text-[10px] font-bold bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 outline-none rounded py-0.5 px-1 md:p-1 cursor-pointer w-fit">
                <option value="This Week">This Week</option><option value="This Month">This Month</option><option value="This Year">This Year</option><option value="Total">Total</option>
              </select>
            </div>
            <p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white mt-1">₹{totalRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-center"><div className="flex items-center gap-1.5 text-blue-500 mb-1"><Package size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide">Total Orders</span></div><p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white">{orders.length}</p></div>
          <div className="bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col justify-center"><div className="flex items-center gap-1.5 text-yellow-600 mb-1"><Clock size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide">Pending</span></div><p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white">{pendingOrders}</p></div>
          <div className={`bg-white dark:bg-[#121212] p-3 md:p-5 rounded-2xl shadow-sm border ${lowStockItems.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-800'} flex flex-col justify-center`}><div className="flex items-center gap-1.5 text-red-500 mb-1"><AlertTriangle size={16} className="md:w-[18px]" /><span className="text-[10px] md:text-xs font-bold uppercase tracking-wide leading-tight">Low Stock</span></div><p className="text-lg md:text-2xl font-extrabold text-gray-900 dark:text-white">{lowStockItems.length} <span className="text-[10px] md:text-sm text-gray-500 font-medium">items</span></p></div>
        </div>

        {/* TABS (Horizontally scrollable on mobile) */}
        <div className="bg-white dark:bg-[#121212] p-2 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex overflow-x-auto gap-2 w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button onClick={() => setActiveTab("orders")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "orders" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Package size={18} /> Orders</button>
          <button onClick={() => setActiveTab("inventory")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "inventory" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Box size={18} /> Inventory</button>
          <button onClick={() => setActiveTab("customers")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "customers" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Users size={18} /> Customers</button>
          <button onClick={() => setActiveTab("coupons")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "coupons" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Tag size={18} /> Coupons</button>
          <button onClick={() => setActiveTab("settings")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "settings" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Settings size={18} /> Settings</button>
          <button onClick={() => setActiveTab("reviews")} className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ${activeTab === "reviews" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"}`}><Star size={18} /> Reviews {unreadReviewsCount > 0 && <span className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full">{unreadReviewsCount}</span>}</button>
        </div>

        {/* ================= TAB CONTENTS ================= */}
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
                    <button onClick={exportSalesToCSV} className="w-full md:w-auto bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold px-4 py-3 md:py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center gap-1.5 transition shrink-0">
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
                          <div key={order.id} className={`rounded-2xl shadow-sm border-2 overflow-hidden flex flex-col transition-all duration-300 ${isPending ? 'border-yellow-500 bg-yellow-50/40 dark:bg-yellow-900/20 shadow-md' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#121212]'}`}>
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
                                  
                                  {/* Payment Method Badge */}
                                  <p className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800/50 uppercase mt-1">
                                    💳 {order.customerDetails?.paymentMethod || order.paymentMethod || "Cash on Delivery"}
                                  </p>

                                  {!isPickup && order.customerDetails?.mapLink && <a href={order.customerDetails.mapLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-sm font-bold border border-blue-200 dark:border-blue-800/50 transition mt-2"><ExternalLink size={14} /> Open Map</a>}
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
                    <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-bold shrink-0 transition"><Plus size={16} /> <span className="hidden md:inline">Add Product</span><span className="md:hidden">Add</span></button>
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
                              {isLowStock && <span className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded font-extrabold border border-red-200 dark:border-red-800/50 flex items-center gap-1"><AlertTriangle size={10} /> Low Stock</span>}
                            </h3>
                            <p className="text-[11px] md:text-sm text-gray-500 dark:text-gray-400">{product.category} • {product.unit}</p>
                            <p className="font-bold text-green-600 dark:text-green-500 mt-0.5 md:mt-1 text-sm md:text-base">₹{product.price}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t border-gray-100 md:border-t-0 dark:border-gray-800">
                          <div className="flex flex-col items-start md:items-end">
                            <p className="text-[9px] md:text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">Quick Stock Update</p>
                            <StockEditor item={product} />
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
                    <div key={idx} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col">
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
                    <button type="submit" disabled={savingDeliveryConfig} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-md mt-2 flex justify-center items-center gap-2">
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

                    <button type="submit" disabled={savingTimings} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition shadow-md mt-2 flex justify-center items-center gap-2">
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
                    <div key={rev.id} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-3">
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
                      <button onClick={async () => { if(window.confirm("Delete this review?")) await deleteDoc(doc(db, "reviews", rev.id)); }} className="mt-auto self-end flex items-center gap-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-bold transition">
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
                  <button onClick={() => setShowCouponModal(true)} className="flex items-center justify-center w-full sm:w-auto gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 sm:py-2 rounded-lg text-sm font-bold shrink-0 transition"><Plus size={16} /> Create Coupon</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {coupons.map((coupon) => (
                    <div key={coupon.id} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 md:p-5 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-blue-500 shadow-sm flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 font-black tracking-widest px-3 py-1 rounded border border-blue-200 dark:border-blue-800/50 uppercase text-base md:text-lg">
                          {coupon.code}
                        </div>
                        <button onClick={async () => { if(window.confirm("Delete this coupon?")) await deleteDoc(doc(db, "coupons", coupon.id)); }} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={18} /></button>
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
          </>
        )}
      </div>

      {/* ================= CANCELLATION REASON MODAL ================= */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-500" /> Cancel Order
              </h2>
              <button onClick={() => setShowCancelModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500">
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

      {/* ================= MODALS ================= */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Key size={20} className="text-blue-500" /> Change Password</h2>
              <button onClick={() => setShowPasswordModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleChangePasswordSubmit} className="p-4 md:p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Old Password</label>
                <input required type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">New Password</label>
                <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Confirm New Password</label>
                <input required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <button type="submit" disabled={changingPass} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-2 transition">{changingPass ? "Updating..." : "Update Password"}</button>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Plus size={20} className="text-green-600" /> Add Product</h2>
              <button onClick={() => { setShowAddModal(false); setIsAddingCustomCategory(false); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddProduct} className="p-4 md:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Image Link</label>
                <div className="relative">
                  <Link className="absolute left-3 top-3 text-gray-400" size={16} />
                  <input type="url" placeholder="Paste image URL here..." className="w-full border border-gray-300 dark:border-gray-700 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.imageUrl} onChange={(e) => setNewItem({...newItem, imageUrl: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Name</label>
                <input required type="text" placeholder="e.g. Aashirvaad Atta" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Price (₹)</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.price} onChange={(e) => setNewItem({...newItem, price: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Stock</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.stockQuantity} onChange={(e) => setNewItem({...newItem, stockQuantity: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Category</label>
                  {isAddingCustomCategory ? (
                    <div className="relative">
                      <input required type="text" placeholder="Custom" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none pr-8 transition" value={customCategoryName} onChange={(e) => setCustomCategoryName(e.target.value)} autoFocus />
                      <button type="button" onClick={() => setIsAddingCustomCategory(false)} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"><X size={16} /></button>
                    </div>
                  ) : (
                    <select className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.category} onChange={(e) => { if (e.target.value === "+ Add New Category") setIsAddingCustomCategory(true); else setNewItem({...newItem, category: e.target.value}); }}>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Unit Size</label>
                  <input required type="text" placeholder="e.g. 5 kg" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition" value={newItem.unit} onChange={(e) => setNewItem({...newItem, unit: e.target.value})} />
                </div>
              </div>
              <button type="submit" disabled={addingProduct} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg mt-2 transition">{addingProduct ? "Adding..." : "Save Product"}</button>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Pencil size={20} className="text-blue-500" /> Edit Product</h2>
              <button onClick={() => { setShowEditModal(false); setEditingProduct(null); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-4 md:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Image Link</label>
                <div className="relative">
                  <Link className="absolute left-3 top-3 text-gray-400" size={16} />
                  <input type="url" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.imageUrl || ""} onChange={(e) => setEditingProduct({...editingProduct, imageUrl: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Product Name</label>
                <input required type="text" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.name} onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Price (₹)</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.price} onChange={(e) => setEditingProduct({...editingProduct, price: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Stock</label>
                  <input required type="number" min="0" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.stockQuantity} onChange={(e) => setEditingProduct({...editingProduct, stockQuantity: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Category</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.category} onChange={(e) => setEditingProduct({...editingProduct, category: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-300">Unit Size</label>
                  <input required type="text" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition" value={editingProduct.unit} onChange={(e) => setEditingProduct({...editingProduct, unit: e.target.value})} />
                </div>
              </div>
              <button type="submit" disabled={savingEdit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-2 transition">{savingEdit ? "Saving Changes..." : "Save Changes"}</button>
            </form>
          </div>
        </div>
      )}

      {showCouponModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1e1e] flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Tag size={20} className="text-blue-500" /> Create Promo Code</h2>
              <button onClick={() => setShowCouponModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500"><X size={20} /></button>
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
              <button type="submit" disabled={addingCoupon} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-2 transition">{addingCoupon ? "Creating..." : "Create Coupon"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}