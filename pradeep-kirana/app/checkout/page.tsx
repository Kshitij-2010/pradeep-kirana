"use client";

import { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { useCart } from "@/context/CartContext";
import { useRouter } from "next/navigation";
import {
  Navigation2,
  CheckCircle2,
  Banknote,
  QrCode,
  Store,
  Truck,
  AlertTriangle,
  Tag,
  X,
} from "lucide-react";

export default function CheckoutPage() {
  const { cart, cartTotal, clearCart } = useCart() as any;
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  const [storeStatus, setStoreStatus] = useState({
    deliveryPaused: false,
    storePaused: false,
    autoTimeEnabled: false,
    openTime: "09:00",
    closeTime: "21:00",
  });

  const [isStoreOpen, setIsStoreOpen] = useState(true);

  // Toast notification
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    show: false,
    message: "",
    type: "info",
  });

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info"
  ) => {
    setToast({
      show: true,
      message,
      type,
    });

    setTimeout(() => {
      setToast((prev) => ({
        ...prev,
        show: false,
      }));
    }, 4000);
  };

  // Delivery Configuration
  const [deliveryConfig, setDeliveryConfig] = useState({
    baseFee: 10,
    freeAbove: 100,
  });

  const [locationCoords, setLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [saveAddress, setSaveAddress] = useState(true);

  // Promo
  const [promoCode, setPromoCode] = useState("");

  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount: number;
  } | null>(null);

  const [promoError, setPromoError] = useState("");
  const [checkingPromo, setCheckingPromo] = useState(false);

  const deliveryFee =
    cartTotal < deliveryConfig.freeAbove
      ? deliveryConfig.baseFee
      : 0;

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    mapLink: "",
    paymentMethod: "Cash on Delivery",
    orderType: "Delivery",
  });

  // ============================================================
  // STORE TIMING
  // ============================================================

  const checkStoreTimings = (statusData: any) => {
    if (!statusData) return true;

    if (statusData.storePaused) {
      return false;
    }

    if (
      statusData.autoTimeEnabled &&
      statusData.openTime &&
      statusData.closeTime
    ) {
      const now = new Date();

      const current =
        now.getHours() * 60 + now.getMinutes();

      const [oh, om] = statusData.openTime
        .split(":")
        .map(Number);

      const [ch, cm] = statusData.closeTime
        .split(":")
        .map(Number);

      const open = oh * 60 + om;
      const close = ch * 60 + cm;

      // Handles overnight opening hours.
      if (close < open) {
        return current >= open || current <= close;
      }

      return current >= open && current <= close;
    }

    return true;
  };

  // ============================================================
  // AUTH + STORE SETTINGS
  // ============================================================

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser);

        if (!currentUser) {
          return;
        }

        try {
          const userDocRef = doc(
            db,
            "users",
            currentUser.uid
          );

          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const data = userDoc.data();

            setFormData((prev) => ({
              ...prev,
              name:
                data.name ||
                currentUser.displayName ||
                "",
              phone: data.phone || "",
              address: data.address || "",
              mapLink: data.mapLink || "",
            }));

            if (
              typeof data.lat === "number" &&
              typeof data.lng === "number"
            ) {
              setLocationCoords({
                lat: data.lat,
                lng: data.lng,
              });
            }
          } else {
            setFormData((prev) => ({
              ...prev,
              name:
                currentUser.displayName || "",
            }));
          }
        } catch (error) {
          console.error(
            "Failed to load user profile:",
            error
          );
        }
      }
    );

    // Realtime store status
    const unsubStoreStatus = onSnapshot(
      doc(db, "settings", "storeStatus"),
      (docSnap) => {
        if (!docSnap.exists()) {
          return;
        }

        const data = docSnap.data() as any;

        setStoreStatus(data);

        const open = checkStoreTimings(data);

        setIsStoreOpen(open);

        if (!open) {
          showToast(
            "Store is currently closed. Redirecting to home...",
            "error"
          );

          setTimeout(() => {
            router.push("/");
          }, 2500);
        }

        if (data.deliveryPaused) {
          setFormData((prev) => ({
            ...prev,
            orderType: "Pickup",
          }));
        }
      }
    );

    // Realtime delivery configuration
    const unsubDeliveryConfig = onSnapshot(
      doc(db, "settings", "deliveryConfig"),
      (docSnap) => {
        if (!docSnap.exists()) {
          return;
        }

        const data = docSnap.data() as any;

        setDeliveryConfig({
          baseFee:
            Number(data.baseFee) || 10,
          freeAbove:
            Number(data.freeAbove) || 100,
        });
      }
    );

    return () => {
      unsubscribeAuth();
      unsubStoreStatus();
      unsubDeliveryConfig();
    };
  }, [router]);

  // ============================================================
  // LOCATION
  // ============================================================

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      showToast(
        "Your browser does not support location features.",
        "error"
      );

      return;
    }

    setFetchingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLocationCoords({
          lat,
          lng,
        });

        setFormData((prev) => ({
          ...prev,
          mapLink: `https://www.google.com/maps?q=${lat},${lng}`,
        }));

        setFetchingLocation(false);

        showToast(
          "Live location attached successfully.",
          "success"
        );
      },
      () => {
        showToast(
          "Please allow location permissions in your browser.",
          "error"
        );

        setFetchingLocation(false);
      }
    );
  };

  // ============================================================
  // PROMO CODE
  // ============================================================

  const applyPromoCode = async () => {
    const normalizedCode =
      promoCode.trim().toUpperCase();

    if (!normalizedCode) {
      return;
    }

    setCheckingPromo(true);
    setPromoError("");

    try {
      /*
       * This is only a UX preview.
       * The checkout API performs the authoritative
       * coupon validation again.
       */
      const { collection, query, where, getDocs } =
        await import("firebase/firestore");

      const q = query(
        collection(db, "coupons"),
        where("code", "==", normalizedCode)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setPromoError("Invalid promo code.");
        setAppliedPromo(null);
        return;
      }

      const couponData =
        querySnapshot.docs[0].data();

      const minOrderAmount =
        Number(couponData.minOrderAmount);

      const discountAmount =
        Number(couponData.discountAmount);

      if (
        !Number.isFinite(minOrderAmount) ||
        !Number.isFinite(discountAmount)
      ) {
        setPromoError(
          "This promo code is currently unavailable."
        );

        setAppliedPromo(null);
        return;
      }

      if (couponData.active === false) {
        setPromoError(
          "This promo code is no longer active."
        );

        setAppliedPromo(null);
        return;
      }

      if (couponData.expiresAt) {
        const expiresAt =
          typeof couponData.expiresAt.toDate ===
          "function"
            ? couponData.expiresAt.toDate()
            : new Date(couponData.expiresAt);

        if (
          !Number.isNaN(expiresAt.getTime()) &&
          expiresAt.getTime() < Date.now()
        ) {
          setPromoError(
            "This promo code has expired."
          );

          setAppliedPromo(null);
          return;
        }
      }

      if (cartTotal < minOrderAmount) {
        setPromoError(
          `Minimum order amount for this code is ₹${minOrderAmount}`
        );

        setAppliedPromo(null);
        return;
      }

      if (
        discountAmount <= 0 ||
        discountAmount > cartTotal
      ) {
        setPromoError(
          "This promo code cannot be applied to this order."
        );

        setAppliedPromo(null);
        return;
      }

      setAppliedPromo({
        code: normalizedCode,
        discount: discountAmount,
      });

      setPromoError("");

      showToast(
        `Coupon '${normalizedCode}' applied successfully!`,
        "success"
      );
    } catch (error) {
      console.error(
        "Promo verification failed:",
        error
      );

      setPromoError(
        "Failed to verify code."
      );

      setAppliedPromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError("");

    showToast(
      "Promo code removed.",
      "info"
    );
  };

  // ============================================================
  // TOTALS
  // ============================================================

  const actualDeliveryFee =
    formData.orderType === "Delivery"
      ? deliveryFee
      : 0;

  const discountAmount =
    appliedPromo
      ? appliedPromo.discount
      : 0;

  const finalTotal = Math.max(
    0,
    cartTotal +
      actualDeliveryFee -
      discountAmount
  );

  // ============================================================
  // EMPTY CART
  // ============================================================

  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-300">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Your Cart is Empty!
        </h2>

        <button
          onClick={() => router.push("/")}
          className="bg-green-700 dark:bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-800 transition"
        >
          Back to Store
        </button>
      </div>
    );
  }

  // ============================================================
  // SECURE ORDER PLACEMENT
  // ============================================================

  const handlePlaceOrder = async (e: any) => {
    e.preventDefault();

    // ----------------------------------------------------------
    // Client-side checks are for UX only.
    // The API performs the authoritative security checks.
    // ----------------------------------------------------------

    if (!isStoreOpen || storeStatus.storePaused) {
      showToast(
        "Store is currently closed. Cannot accept orders right now.",
        "error"
      );

      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      showToast(
        "Please login first to place an order.",
        "error"
      );

      return;
    }

    if (
      storeStatus.deliveryPaused &&
      formData.orderType === "Delivery"
    ) {
      showToast(
        "Home Delivery is currently paused. Please select Store Pickup.",
        "error"
      );

      return;
    }

    // ----------------------------------------------------------
    // Validate customer input before sending it to the API.
    // The API validates it again.
    // ----------------------------------------------------------

    const name = formData.name.trim();
    const phone = formData.phone.trim();
    const address = formData.address.trim();

    if (!name || name.length > 50) {
      showToast(
        "Please enter a valid name.",
        "error"
      );

      return;
    }

    if (
      !/^\+?[0-9\s-]{10,15}$/.test(phone)
    ) {
      showToast(
        "Please enter a valid phone number.",
        "error"
      );

      return;
    }

    if (
      formData.orderType !== "Delivery" &&
      formData.orderType !== "Pickup"
    ) {
      showToast(
        "Invalid order type.",
        "error"
      );

      return;
    }

    if (
      formData.paymentMethod !==
        "Cash on Delivery" &&
      formData.paymentMethod !==
        "UPI on Delivery"
    ) {
      showToast(
        "Invalid payment method.",
        "error"
      );

      return;
    }

    if (
      formData.orderType === "Delivery" &&
      (address.length < 5 ||
        address.length > 200)
    ) {
      showToast(
        "Please enter a valid delivery address.",
        "error"
      );

      return;
    }

    // ----------------------------------------------------------
    // Cart validation
    // ----------------------------------------------------------

    if (
      !Array.isArray(cart) ||
      cart.length === 0 ||
      cart.length > 50
    ) {
      showToast(
        "Your cart is invalid. Please refresh and try again.",
        "error"
      );

      return;
    }

    const productIds = cart.map(
      (item: any) => item.id
    );

    const uniqueProductIds =
      new Set(productIds);

    if (
      uniqueProductIds.size !==
      productIds.length
    ) {
      showToast(
        "Your cart contains a duplicate item. Please refresh your cart.",
        "error"
      );

      return;
    }

    // Validate basic cart values before sending.
    for (const item of cart) {
      if (
        typeof item.id !== "string" ||
        !item.id.trim()
      ) {
        showToast(
          "Your cart contains an invalid product.",
          "error"
        );

        return;
      }

      if (
        !Number.isInteger(item.cartQuantity) ||
        item.cartQuantity <= 0 ||
        item.cartQuantity > 100
      ) {
        showToast(
          "Your cart contains an invalid quantity.",
          "error"
        );

        return;
      }
    }

    setLoading(true);

    try {
      // --------------------------------------------------------
      // IMPORTANT:
      // Never send UID in the request body.
      //
      // The backend verifies this Firebase ID token and
      // derives the UID from the verified token.
      // --------------------------------------------------------

      const idToken =
        await currentUser.getIdToken(true);

      const orderPayload = {
        items: cart.map((item: any) => ({
          id: String(item.id),
          cartQuantity: Number(
            item.cartQuantity
          ),
        })),

        couponCode:
          appliedPromo?.code
            ? appliedPromo.code
                .trim()
                .toUpperCase()
            : null,

        customerDetails: {
          name,
          phone,

          address:
            formData.orderType ===
            "Delivery"
              ? address
              : "Store Pickup",

          orderType:
            formData.orderType,

          paymentMethod:
            formData.paymentMethod,
        },
      };

      // --------------------------------------------------------
      // Secure API request
      // --------------------------------------------------------

      const response = await fetch(
        "/api/checkout",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${idToken}`,
          },

          body: JSON.stringify(
            orderPayload
          ),
        }
      );

      let data: any = null;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "The server returned an invalid response."
        );
      }

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.error ||
            "Unable to process your order."
        );
      }

      // --------------------------------------------------------
      // ORDER IS NOW SUCCESSFULLY CREATED.
      //
      // Saving the address is a separate operation.
      // If this fails, DO NOT tell the user their order failed.
      // --------------------------------------------------------

      if (
        saveAddress &&
        formData.orderType ===
          "Delivery"
      ) {
        try {
          await setDoc(
            doc(
              db,
              "users",
              currentUser.uid
            ),
            {
              name,
              phone,
              address,

              photoURL:
                currentUser.photoURL ||
                "",

              updatedAt: new Date(),
            },
            {
              merge: true,
            }
          );
        } catch (addressError) {
          console.error(
            "Order succeeded but saving address failed:",
            addressError
          );

          showToast(
            "Order placed successfully. Your address could not be saved for next time.",
            "info"
          );
        }
      }

      // --------------------------------------------------------
      // Clear cart ONLY after the API confirms success.
      // --------------------------------------------------------

      if (clearCart) {
        clearCart();
      }

      showToast(
        "Order placed successfully! Redirecting to orders...",
        "success"
      );

      setTimeout(() => {
        router.push("/orders");
      }, 1500);
    } catch (error: any) {
      console.error(
        "Order failed:",
        error
      );

      showToast(
        error?.message ||
          "Unable to process your order. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-4 md:p-8 transition-colors duration-300 relative">

      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 max-w-md p-4 rounded-2xl shadow-2xl flex items-center justify-between border animate-in slide-in-from-top-5 duration-300 ${
            toast.type === "error"
              ? "bg-red-600 text-white border-red-400"
              : toast.type === "success"
              ? "bg-green-600 text-white border-green-400"
              : "bg-blue-600 text-white border-blue-400"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full shrink-0">
              {toast.type ===
              "error" ? (
                <AlertTriangle size={20} />
              ) : (
                <CheckCircle2 size={20} />
              )}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">
                Notification
              </p>

              <p className="text-sm font-extrabold leading-tight">
                {toast.message}
              </p>
            </div>
          </div>

          <button
            onClick={() =>
              setToast((prev) => ({
                ...prev,
                show: false,
              }))
            }
            className="p-1 hover:bg-black/20 rounded-full transition shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="max-w-2xl mx-auto bg-white dark:bg-[#121212] p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">

        <h1 className="text-2xl font-extrabold mb-4 border-b border-gray-200 dark:border-gray-800 pb-4 text-gray-900 dark:text-white">
          Checkout
        </h1>

        {/* Store Closed Warning */}
        {!isStoreOpen && (
          <div className="mb-6 bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800/60 p-4 rounded-xl flex items-center gap-3 text-red-800 dark:text-red-300">
            <Store
              size={22}
              className="shrink-0 text-red-600 dark:text-red-400"
            />

            <div>
              <p className="text-sm font-bold">
                Store is currently closed.
              </p>

              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                We are not accepting orders right now.
                Redirecting you to home...
              </p>
            </div>
          </div>
        )}

        {/* ================================================== */}
        {/* ORDER SUMMARY */}
        {/* ================================================== */}

        <div className="mb-6 bg-gray-50 dark:bg-[#1e1e1e] p-4 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors">

          <h2 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">
            Order Summary
          </h2>

          {cart.map((item: any) => (
            <div
              key={item.id}
              className="flex justify-between text-sm mb-2 text-gray-700 dark:text-gray-300"
            >
              <span>
                {item.cartQuantity}x{" "}
                {item.name}
              </span>

              <span className="font-semibold text-gray-900 dark:text-white">
                ₹
                {(
                  item.price *
                  item.cartQuantity
                ).toFixed(2)}
              </span>
            </div>
          ))}

          <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">

            <div className="flex justify-between">
              <span>
                Item Total:
              </span>

              <span className="font-semibold">
                ₹
                {Number(
                  cartTotal
                ).toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between">

              <span>
                Delivery Fee:
              </span>

              {formData.orderType ===
              "Pickup" ? (
                <span className="text-green-600 dark:text-green-500 font-bold border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded text-[10px] uppercase">
                  Free (Pickup)
                </span>
              ) : deliveryFee ===
                0 ? (
                <span className="text-green-600 dark:text-green-500 font-bold border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded text-[10px] uppercase">
                  Free Delivery
                </span>
              ) : (
                <span className="font-semibold">
                  ₹
                  {Number(
                    deliveryFee
                  ).toFixed(2)}
                </span>
              )}
            </div>

            {appliedPromo && (
              <div className="flex justify-between text-green-600 dark:text-green-500 font-bold">
                <span>
                  Discount (
                  {appliedPromo.code}
                  ):
                </span>

                <span>
                  -₹
                  {Number(
                    appliedPromo.discount
                  ).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3 flex justify-between font-bold text-lg text-gray-900 dark:text-white">

            <span>
              Total Payable:
            </span>

            <span className="text-green-700 dark:text-green-500">
              ₹
              {Number(
                finalTotal
              ).toFixed(2)}
            </span>
          </div>

          {/* ================================================== */}
          {/* PROMO */}
          {/* ================================================== */}

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">

            {appliedPromo ? (
              <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 p-3 rounded-lg">

                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-sm">
                  <Tag size={16} />

                  "{appliedPromo.code}" Applied!
                </div>

                <button
                  type="button"
                  onClick={
                    removePromoCode
                  }
                  className="text-xs text-red-500 hover:underline font-bold"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>

                <div className="flex gap-2">

                  <input
                    type="text"
                    placeholder="Enter Promo Code"
                    value={promoCode}
                    onChange={(e) =>
                      setPromoCode(
                        e.target.value.toUpperCase()
                      )
                    }
                    maxLength={30}
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-[#121212] text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 outline-none uppercase"
                  />

                  <button
                    type="button"
                    onClick={
                      applyPromoCode
                    }
                    disabled={
                      checkingPromo ||
                      !promoCode.trim()
                    }
                    className="bg-gray-800 dark:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 transition"
                  >
                    {checkingPromo
                      ? "..."
                      : "Apply"}
                  </button>
                </div>

                {promoError && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    {promoError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================================================== */}
        {/* CHECKOUT FORM */}
        {/* ================================================== */}

        <form
          onSubmit={handlePlaceOrder}
          className="space-y-4"
        >

          {/* ORDER TYPE */}

          <div className="mb-6">

            <label className="block text-sm font-semibold mb-3 text-gray-800 dark:text-gray-300">
              Order Preference
            </label>

            {storeStatus.deliveryPaused && (
              <div className="mb-3 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/50 flex items-start gap-2">

                <AlertTriangle
                  className="text-red-500 shrink-0 mt-0.5"
                  size={16}
                />

                <p className="text-xs font-bold text-red-700 dark:text-red-400">
                  Home delivery is currently paused.
                  Only store pickup is available.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">

              {/* DELIVERY */}

              <label
                className={`flex items-center gap-3 p-4 border-2 rounded-xl transition ${
                  storeStatus.deliveryPaused
                    ? "opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-[#171717] grayscale"
                    : formData.orderType ===
                      "Delivery"
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20 cursor-pointer"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] cursor-pointer"
                }`}
              >

                <input
                  type="radio"
                  name="orderType"
                  value="Delivery"
                  disabled={
                    storeStatus.deliveryPaused
                  }
                  checked={
                    formData.orderType ===
                      "Delivery" &&
                    !storeStatus.deliveryPaused
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      orderType:
                        e.target.value,
                    })
                  }
                  className="w-4 h-4 text-green-600 focus:ring-green-500 disabled:opacity-50"
                />

                <Truck
                  className={
                    formData.orderType ===
                      "Delivery" &&
                    !storeStatus.deliveryPaused
                      ? "text-green-600"
                      : "text-gray-400"
                  }
                  size={20}
                />

                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    Home Delivery
                  </p>

                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {storeStatus.deliveryPaused
                      ? "Unavailable"
                      : cartTotal <
                        deliveryConfig.freeAbove
                      ? `₹${deliveryConfig.baseFee} charge (Free above ₹${deliveryConfig.freeAbove})`
                      : "Free Delivery"}
                  </p>
                </div>
              </label>

              {/* PICKUP */}

              <label
                className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${
                  formData.orderType ===
                  "Pickup"
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]"
                }`}
              >

                <input
                  type="radio"
                  name="orderType"
                  value="Pickup"
                  checked={
                    formData.orderType ===
                    "Pickup"
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      orderType:
                        e.target.value,
                    })
                  }
                  className="w-4 h-4 text-orange-600 focus:ring-orange-500"
                />

                <Store
                  className={
                    formData.orderType ===
                    "Pickup"
                      ? "text-orange-600"
                      : "text-gray-400"
                  }
                  size={20}
                />

                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    Store Pickup
                  </p>

                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Free • Collect from store
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* NAME */}

          <div>
            <label className="block text-sm font-semibold mb-1 text-gray-800 dark:text-gray-300">
              Full Name
            </label>

            <input
              required
              maxLength={50}
              type="text"
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition"
              value={formData.name}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  name: e.target.value,
                })
              }
            />
          </div>

          {/* PHONE */}

          <div>
            <label className="block text-sm font-semibold mb-1 text-gray-800 dark:text-gray-300">
              Phone Number
            </label>

            <input
              required
              maxLength={15}
              type="tel"
              inputMode="tel"
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition"
              value={formData.phone}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  phone: e.target.value,
                })
              }
            />
          </div>

          {/* DELIVERY ADDRESS */}

          {formData.orderType ===
          "Delivery" ? (
            <div className="relative animate-in fade-in duration-300">

              <div className="flex justify-between items-end mb-1">

                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-300">
                  Delivery Address
                </label>

                <button
                  type="button"
                  onClick={
                    handleGetLocation
                  }
                  disabled={
                    fetchingLocation
                  }
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 px-3 py-1.5 rounded-md border border-blue-200 dark:border-blue-800/50 transition"
                >

                  <Navigation2
                    size={14}
                    className={
                      fetchingLocation
                        ? "animate-pulse"
                        : ""
                    }
                  />

                  {fetchingLocation
                    ? "Locating..."
                    : "Use Live Location"}
                </button>
              </div>

              <textarea
                required
                maxLength={200}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition"
                rows={2}
                value={formData.address}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address:
                      e.target.value,
                  })
                }
              />

              {locationCoords && (
                <div className="mt-3 w-full h-48 rounded-xl overflow-hidden border-2 border-green-500/50 relative shadow-inner">

                  <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    scrolling="no"
                    loading="lazy"
                    title="Delivery location map"
                    src={`https://maps.google.com/maps?q=${locationCoords.lat},${locationCoords.lng}&hl=en&z=15&output=embed`}
                  />

                  <div className="absolute bottom-2 right-2 bg-green-600 text-white text-[10px] px-2 py-1 rounded shadow-md flex items-center gap-1 font-bold">
                    <CheckCircle2 size={12} />
                    Attached
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-2">

                <input
                  type="checkbox"
                  id="saveAddress"
                  checked={saveAddress}
                  onChange={(e) =>
                    setSaveAddress(
                      e.target.checked
                    )
                  }
                  className="w-4 h-4 text-green-600 rounded focus:ring-green-500 transition"
                />

                <label
                  htmlFor="saveAddress"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Save this location for future orders
                </label>
              </div>
            </div>
          ) : (
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800/30 text-orange-800 dark:text-orange-300 text-sm font-medium animate-in fade-in duration-300 shadow-sm">
              🏬{" "}
              <b className="ml-1">
                Pickup Selected:
              </b>{" "}
              Please visit Pradeep Kirana Store,
              Unnao to collect your items.
            </div>
          )}

          {/* ================================================== */}
          {/* PAYMENT METHOD */}
          {/* ================================================== */}

          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">

            <label className="block text-sm font-semibold mb-3 text-gray-800 dark:text-gray-300">
              Mode of Payment
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* CASH */}

              <label
                className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${
                  formData.paymentMethod ===
                  "Cash on Delivery"
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]"
                }`}
              >

                <input
                  type="radio"
                  name="paymentMethod"
                  value="Cash on Delivery"
                  checked={
                    formData.paymentMethod ===
                    "Cash on Delivery"
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      paymentMethod:
                        e.target.value,
                    })
                  }
                  className="w-4 h-4 text-green-600 focus:ring-green-500"
                />

                <Banknote
                  className={
                    formData.paymentMethod ===
                    "Cash on Delivery"
                      ? "text-green-600"
                      : "text-gray-400"
                  }
                  size={20}
                />

                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    Cash / Pay at Shop
                  </p>

                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Pay directly
                  </p>
                </div>
              </label>

              {/* UPI */}

              <label
                className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition ${
                  formData.paymentMethod ===
                  "UPI on Delivery"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]"
                }`}
              >

                <input
                  type="radio"
                  name="paymentMethod"
                  value="UPI on Delivery"
                  checked={
                    formData.paymentMethod ===
                    "UPI on Delivery"
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      paymentMethod:
                        e.target.value,
                    })
                  }
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />

                <QrCode
                  className={
                    formData.paymentMethod ===
                    "UPI on Delivery"
                      ? "text-blue-600"
                      : "text-gray-400"
                  }
                  size={20}
                />

                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    UPI / Online
                  </p>

                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Pay via GPay, Paytm
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* ================================================== */}
          {/* PLACE ORDER */}
          {/* ================================================== */}

          <button
            type="submit"
            disabled={
              loading ||
              !isStoreOpen
            }
            className={`w-full py-4 rounded-xl font-bold text-lg transition shadow-lg mt-6 flex justify-center items-center ${
              !isStoreOpen
                ? "bg-gray-400 dark:bg-gray-700 text-gray-200 cursor-not-allowed"
                : "bg-green-700 dark:bg-green-600 text-white hover:bg-green-800 dark:hover:bg-green-500"
            }`}
          >

            {loading ? (
              <div className="flex items-center gap-2">

                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />

                Verifying & Placing...
              </div>
            ) : !isStoreOpen ? (
              "Checkout Disabled (Store Closed)"
            ) : (
              `Place Order • ₹${Number(
                finalTotal
              ).toFixed(2)}`
            )}
          </button>

        </form>
      </div>
    </div>
  );
}