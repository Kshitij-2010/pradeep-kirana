import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

const ACTIVE_ORDER_STATUSES = [
  "Pending",
  "Accepted",
  "Awaiting Confirmation",
  "Awaiting Pickup Confirmation",
  "Ready for Pickup",
  "Out for Delivery",
  "On the Way",
];

const jsonError = (error, status = 400) =>
  NextResponse.json({ success: false, error }, { status });

const getBearerToken = (req) => {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const isFiniteNonNegative = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const parseDateMillis = (value) => {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export async function POST(req) {
  let uid;

  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("Unauthorized.", 401);

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return jsonError("Unauthorized.", 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const { items, couponCode, customerDetails } = body ?? {};

    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      return jsonError("Invalid items.", 400);
    }

    const normalizedItems = items.map((item) => ({
      id: item?.id,
      cartQuantity: item?.cartQuantity,
    }));

    if (normalizedItems.some((item) =>
      typeof item.id !== "string" ||
      item.id.length < 1 ||
      item.id.length > 150 ||
      !Number.isInteger(item.cartQuantity) ||
      item.cartQuantity < 1 ||
      item.cartQuantity > 100
    )) {
      return jsonError("Invalid item data.", 400);
    }

    const ids = normalizedItems.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      return jsonError("Duplicate products are not allowed.", 400);
    }

    if (!customerDetails || typeof customerDetails !== "object" || Array.isArray(customerDetails)) {
      return jsonError("Invalid customer details.", 400);
    }

    const name = customerDetails.name;
    const phone = customerDetails.phone;
    const address = customerDetails.address;
    const orderType = customerDetails.orderType;
    const paymentMethod = customerDetails.paymentMethod;
    // 🔴 1. Extract lat and lng from request
    const lat = customerDetails.lat;
    const lng = customerDetails.lng;

    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 50) {
      return jsonError("Invalid customer name.", 400);
    }

    if (typeof phone !== "string" || !/^\+?[0-9\s-]{10,15}$/.test(phone.trim())) {
      return jsonError("Invalid phone number.", 400);
    }

    if (orderType !== "Delivery" && orderType !== "Pickup") {
      return jsonError("Invalid order type.", 400);
    }

    if (paymentMethod !== "UPI on Delivery" && paymentMethod !== "Cash on Delivery") {
      return jsonError("Invalid payment method.", 400);
    }

    // 🔴 2. STRICT Location Validation for Delivery
    if (orderType === "Delivery") {
      if (typeof address !== "string" || address.trim().length < 5 || address.trim().length > 200) {
        return jsonError("Invalid delivery address.", 400);
      }
      if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return jsonError("Live location coordinates are strictly required for Home Delivery.", 400);
      }
    }

    if (orderType === "Pickup" && address !== undefined && typeof address !== "string") {
      return jsonError("Invalid address.", 400);
    }

    let normalizedCoupon = null;
    if (couponCode !== undefined && couponCode !== null && couponCode !== "") {
      if (typeof couponCode !== "string" || couponCode.trim().length > 30) {
        return jsonError("Invalid coupon code.", 400);
      }
      normalizedCoupon = couponCode.trim().toUpperCase();
    }

    const orderRef = adminDb.collection("orders").doc();
    const rateLimitRef = adminDb.collection("checkoutRateLimits").doc(uid);

    await adminDb.runTransaction(async (transaction) => {
      const rateLimitSnap = await transaction.get(rateLimitRef);
      const lastRequest = rateLimitSnap.exists ? Number(rateLimitSnap.data()?.lastRequestAt || 0) : 0;
      const now = Date.now();
      if (lastRequest && now - lastRequest < 10000) {
        const err = new Error("RATE_LIMITED");
        err.statusCode = 429;
        throw err;
      }
      transaction.set(rateLimitRef, { lastRequestAt: now }, { merge: true });
    });

    await adminDb.runTransaction(async (transaction) => {
      const activeQuery = adminDb.collection("orders")
        .where("customerId", "==", uid);
      
      const activeSnap = await transaction.get(activeQuery);
      
      const hasActiveOrder = activeSnap.docs.some((orderDoc) => {
        const status = orderDoc.data()?.status;
        return ACTIVE_ORDER_STATUSES.includes(status);
      });

      if (hasActiveOrder) {
        const err = new Error("ACTIVE_ORDER_EXISTS");
        err.statusCode = 409;
        throw err;
      }

      const statusRef = adminDb.collection("settings").doc("storeStatus");
      const deliveryConfigRef = adminDb.collection("settings").doc("deliveryConfig");
      const statusSnap = await transaction.get(statusRef);
      const deliveryConfigSnap = await transaction.get(deliveryConfigRef);

      const productRefs = normalizedItems.map((item) => adminDb.collection("items").doc(item.id));
      const productSnaps = await transaction.getAll(...productRefs);

      let couponSnap = null;
      if (normalizedCoupon) {
        const couponQuery = adminDb.collection("coupons")
          .where("code", "==", normalizedCoupon)
          .limit(1);
        couponSnap = await transaction.get(couponQuery);
      }

      const storeStatus = statusSnap.exists ? statusSnap.data() : {};
      if (storeStatus.storePaused === true) {
        const err = new Error("STORE_CLOSED");
        err.statusCode = 403;
        throw err;
      }
      if (storeStatus.deliveryPaused === true && orderType === "Delivery") {
        const err = new Error("DELIVERY_PAUSED");
        err.statusCode = 403;
        throw err;
      }

      let totalPaise = 0;
      const finalItems = [];
      const stockUpdates = [];

      productSnaps.forEach((snap, index) => {
        if (!snap.exists) {
          const err = new Error("PRODUCT_UNAVAILABLE");
          err.statusCode = 409;
          throw err;
        }

        const product = snap.data();
        const qty = normalizedItems[index].cartQuantity;
        const price = Number(product.price);
        const stock = Number(product.stockQuantity);

        if (product.isAvailable === false || !isFiniteNonNegative(price) || !Number.isInteger(stock) || stock < 0) {
          const err = new Error("PRODUCT_UNAVAILABLE");
          err.statusCode = 409;
          throw err;
        }

        if (stock < qty) {
          const err = new Error("INSUFFICIENT_STOCK");
          err.statusCode = 409;
          throw err;
        }

        const pricePaise = Math.round(price * 100);
        totalPaise += pricePaise * qty;

        if (!Number.isSafeInteger(totalPaise)) {
          const err = new Error("ORDER_TOTAL_TOO_LARGE");
          err.statusCode = 400;
          throw err;
        }

        finalItems.push({
          id: snap.id,
          name: typeof product.name === "string" ? product.name.slice(0, 150) : "Product",
          price,
          cartQuantity: qty,
          imageUrl: typeof product.imageUrl === "string" ? product.imageUrl.slice(0, 1000) : "",
        });

        stockUpdates.push({ ref: productRefs[index], newStock: stock - qty });
      });

      let discountPaise = 0;
      let promoCodeUsed = null;

      if (couponSnap && !couponSnap.empty) {
        const coupon = couponSnap.docs[0].data();
        if (coupon.active === false) {
          const err = new Error("COUPON_INVALID");
          err.statusCode = 400;
          throw err;
        }

        const expiresAt = parseDateMillis(coupon.expiresAt);
        if (expiresAt !== null && expiresAt <= Date.now()) {
          const err = new Error("COUPON_EXPIRED");
          err.statusCode = 400;
          throw err;
        }

        const minOrderPaise = Math.round(Number(coupon.minOrderAmount || 0) * 100);
        const discountAmountPaise = Math.round(Number(coupon.discountAmount || 0) * 100);
        const maxUses = coupon.maxUses == null ? null : Number(coupon.maxUses);
        const usageCount = Number(coupon.usageCount || 0);

        if (!Number.isSafeInteger(minOrderPaise) || minOrderPaise < 0 ||
            !Number.isSafeInteger(discountAmountPaise) || discountAmountPaise <= 0 ||
            (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || usageCount >= maxUses))) {
          const err = new Error("COUPON_INVALID");
          err.statusCode = 400;
          throw err;
        }

        if (totalPaise >= minOrderPaise) {
          discountPaise = Math.min(discountAmountPaise, totalPaise);
          promoCodeUsed = normalizedCoupon;

          transaction.update(couponSnap.docs[0].ref, {
            usageCount: usageCount + 1,
          });
        }
      }

      const config = deliveryConfigSnap.exists ? deliveryConfigSnap.data() : {};
      const baseFee = Number(config.baseFee ?? 10);
      const freeAbove = Number(config.freeAbove ?? 100);
      if (!isFiniteNonNegative(baseFee) || !isFiniteNonNegative(freeAbove)) {
        const err = new Error("INVALID_DELIVERY_CONFIG");
        err.statusCode = 500;
        throw err;
      }

      const deliveryFee = orderType === "Delivery"
        ? (totalPaise >= Math.round(freeAbove * 100) ? 0 : baseFee)
        : 0;
      const finalPaise = Math.max(0, totalPaise - discountPaise + Math.round(deliveryFee * 100));

      const orderData = {
        orderId: `ORD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
        customerId: uid,
        items: finalItems,
        cartTotal: totalPaise / 100,
        discount: discountPaise / 100,
        promoCodeUsed,
        deliveryFee,
        totalAmount: finalPaise / 100,
        // 🔴 3. Saving lat/lng securely to the database
        customerDetails: {
          name: name.trim(),
          phone: phone.trim(),
          address: orderType === "Delivery" ? address.trim() : "Store Pickup",
          orderType,
          paymentMethod,
          lat: orderType === "Delivery" ? lat : null,
          lng: orderType === "Delivery" ? lng : null,
        },
        status: "Pending",
        orderDate: new Date(),
      };

      stockUpdates.forEach(({ ref, newStock }) => {
        transaction.update(ref, { stockQuantity: newStock });
      });

      transaction.set(orderRef, orderData);
    });

    return NextResponse.json({ success: true, message: "Order placed securely!" }, { status: 200 });
  } catch (error) {
    const code = error?.message;
    const status = Number(error?.statusCode) || 500;

    const publicErrors = {
      RATE_LIMITED: [429, "Too many requests. Please wait."],
      ACTIVE_ORDER_EXISTS: [409, "You already have an active order."],
      STORE_CLOSED: [403, "The store is currently closed."],
      DELIVERY_PAUSED: [403, "Home delivery is temporarily paused."],
      PRODUCT_UNAVAILABLE: [409, "One or more products are unavailable."],
      INSUFFICIENT_STOCK: [409, "One or more products do not have enough stock."],
      COUPON_INVALID: [400, "The coupon is invalid."],
      COUPON_EXPIRED: [400, "The coupon has expired."],
      ORDER_TOTAL_TOO_LARGE: [400, "Order total is invalid."],
    };

    if (publicErrors[code]) {
      return jsonError(publicErrors[code][1], publicErrors[code][0]);
    }

    console.error("Checkout error", {
      uid,
      message: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
      stack: error?.stack,
    });
    
    if (process.env.NODE_ENV === "development") {
      return jsonError(
        error?.message || "Unknown checkout error",
        status >= 400 && status < 600 ? status : 500
      );
    }
    
    return jsonError(
      "Unable to process your order.",
      status >= 400 && status < 600 ? status : 500
    );
  }
}