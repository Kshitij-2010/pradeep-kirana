// app/api/checkout/route.js
import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import crypto from "crypto";

// Basic in-memory rate limiter (For production, use Redis/Vercel KV)
const rateLimit = new Map();

export async function POST(req) {
  try {
    // 1. AUTHENTICATION (The most crucial fix)
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: "Unauthorized: Missing Token" }, { status: 401 });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (e) {
      return NextResponse.json({ success: false, error: "Unauthorized: Invalid Token" }, { status: 401 });
    }
    
    const uid = decodedToken.uid;

    // Rate Limiting (1 request per 10 seconds per UID)
    const now = Date.now();
    if (rateLimit.has(uid) && now - rateLimit.get(uid) < 10000) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait." }, { status: 429 });
    }
    rateLimit.set(uid, now);

    const body = await req.json();
    const { items, couponCode, customerDetails } = body;

    // 2. INPUT VALIDATION
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return NextResponse.json({ success: false, error: "Invalid items array" }, { status: 400 });
    }

    // 3. ONE-ACTIVE-ORDER RULE (Server-side check)
    const activeOrdersQuery = await adminDb.collection("orders")
      .where("customerId", "==", uid)
      .where("status", "in", ["Pending", "Accepted", "Awaiting Confirmation", "Awaiting Pickup Confirmation", "Ready for Pickup", "Out for Delivery", "On the Way"])
      .get();

    if (!activeOrdersQuery.empty) {
      return NextResponse.json({ success: false, error: "You already have an active order. Please confirm it first." }, { status: 403 });
    }

    const orderRef = adminDb.collection("orders").doc(); 

    await adminDb.runTransaction(async (transaction) => {
      // 4. STORE STATUS & TIMING SECURITY CHECK
      const statusRef = adminDb.collection("settings").doc("storeStatus");
      const statusSnap = await transaction.get(statusRef);

      if (statusSnap.exists) {
        const storeStatus = statusSnap.data();
        if (storeStatus.storePaused) throw new Error("Store is currently closed.");
        if (storeStatus.deliveryPaused && customerDetails?.orderType === "Delivery") {
          throw new Error("Home delivery is temporarily paused.");
        }
      }

      const productRefs = items.map(item => adminDb.collection("items").doc(item.id));
      const productSnaps = await transaction.getAll(...productRefs);

      let couponSnap = null;
      if (couponCode) {
        const couponQuery = adminDb.collection("coupons").where("code", "==", couponCode).limit(1);
        couponSnap = await transaction.get(couponQuery);
      }

      const settingsRef = adminDb.collection("settings").doc("deliveryConfig");
      const settingsSnap = await transaction.get(settingsRef);

      // 5. VALIDATE STOCK, QUANTITY, AND CALCULATE PRICES
      let calculatedTotal = 0;
      let finalItems = [];
      const stockUpdates = []; 

      productSnaps.forEach((productSnap, index) => {
        if (!productSnap.exists || !productSnap.data().isAvailable) {
          throw new Error(`Item ${items[index].name || 'requested'} is no longer available.`);
        }
        
        const productData = productSnap.data();
        const requestedQty = items[index].cartQuantity;

        // Strict Quantity Validation
        if (!Number.isInteger(requestedQty) || requestedQty <= 0 || requestedQty > 100) {
          throw new Error(`Invalid quantity for ${productData.name}.`);
        }

        if (productData.stockQuantity < requestedQty) {
          throw new Error(`Only ${productData.stockQuantity} of ${productData.name} left in stock.`);
        }

        calculatedTotal += productData.price * requestedQty;
        finalItems.push({
          id: productSnap.id,
          name: productData.name,
          price: productData.price, // Trusted server price
          cartQuantity: requestedQty,
          imageUrl: productData.imageUrl || ""
        });

        stockUpdates.push({
          ref: productRefs[index],
          newStock: productData.stockQuantity - requestedQty
        });
      });

      // 6. FINAL CALCULATIONS & ORDER CREATION
      let discount = 0;
      if (couponSnap && !couponSnap.empty) {
        const couponData = couponSnap.docs[0].data();
        if (calculatedTotal >= couponData.minOrderAmount) {
          discount = couponData.discountAmount;
        }
      }

      const deliveryConfig = settingsSnap.exists ? settingsSnap.data() : { baseFee: 10, freeAbove: 100 };
      let deliveryFee = 0;
      if (customerDetails?.orderType === "Delivery") {
        deliveryFee = calculatedTotal >= deliveryConfig.freeAbove ? 0 : deliveryConfig.baseFee;
      }

      const finalAmount = Math.max(0, calculatedTotal - discount + deliveryFee);
      const uniqueOrderId = "ORD-" + crypto.randomInt(100000, 999999).toString();

      // Sanitized Customer Data
      const orderData = {
        orderId: uniqueOrderId,
        customerId: uid, // Trusted Server UID
        items: finalItems,
        cartTotal: calculatedTotal,
        discount: discount,
        promoCodeUsed: discount > 0 ? couponCode : null,
        deliveryFee: deliveryFee,
        totalAmount: finalAmount,
        customerDetails: {
          name: String(customerDetails?.name || "").substring(0, 50),
          phone: String(customerDetails?.phone || "").substring(0, 15),
          address: String(customerDetails?.address || "Store Pickup").substring(0, 200),
          orderType: customerDetails?.orderType === "Delivery" ? "Delivery" : "Pickup",
          paymentMethod: customerDetails?.paymentMethod === "UPI on Delivery" ? "UPI on Delivery" : "Cash on Delivery"
        },
        status: "Pending",
        orderDate: new Date() 
      };

      stockUpdates.forEach(update => {
        transaction.update(update.ref, { stockQuantity: update.newStock });
      });

      transaction.set(orderRef, orderData);
    }); 

    return NextResponse.json({ success: true, message: "Order placed securely!" }, { status: 200 });

  } catch (error) {
    console.error("Checkout Security Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to process order securely." }, { status: 500 });
  }
}