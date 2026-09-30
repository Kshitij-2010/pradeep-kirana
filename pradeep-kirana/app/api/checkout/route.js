import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin"; // Aapki js file ka path
import crypto from "crypto";

export async function POST(req) {
  try {
    const body = await req.json();
    const { items, couponCode, uid, customerDetails } = body;

    // 1. Basic Validation
    if (!items || items.length === 0 || !uid) {
      return NextResponse.json({ success: false, error: "Invalid Order Data" }, { status: 400 });
    }

    const orderRef = adminDb.collection("orders").doc(); 

    // ================= ATOMIC TRANSACTION =================
    await adminDb.runTransaction(async (transaction) => {
      
      // ================= PHASE 1: SIRF READ (GET) KARENGE =================
      // 1A. Saare products ko ek saath read karein
      const productRefs = items.map(item => adminDb.collection("items").doc(item.id));
      const productSnaps = await transaction.getAll(...productRefs);

      // 1B. Coupon read karein (agar apply kiya hai toh)
      let couponSnap = null;
      if (couponCode) {
        const couponQuery = adminDb.collection("coupons").where("code", "==", couponCode).limit(1);
        couponSnap = await transaction.get(couponQuery);
      }

      // 1C. Delivery configuration read karein
      const settingsRef = adminDb.collection("settings").doc("deliveryConfig");
      const settingsSnap = await transaction.get(settingsRef);


      // ================= PHASE 2: CALCULATION KARENGE =================
      let calculatedTotal = 0;
      let finalItems = [];
      const stockUpdates = []; // Stock ki nayi value yahan store karenge

      productSnaps.forEach((productSnap, index) => {
        if (!productSnap.exists) {
          throw new Error(`Item ${items[index].name} is no longer available.`);
        }
        
        const productData = productSnap.data();
        const requestedQty = items[index].cartQuantity;

        // Stock Check
        if (productData.stockQuantity < requestedQty) {
          throw new Error(`Sorry, we only have ${productData.stockQuantity} of ${productData.name} left in stock.`);
        }

        // Price Calculation
        calculatedTotal += productData.price * requestedQty;
        finalItems.push({
          id: items[index].id,
          name: productData.name,
          price: productData.price, // Asli server price
          cartQuantity: requestedQty,
          imageUrl: productData.imageUrl || ""
        });

        // Stock minus karne ka data taiyar karke rakhein (Abhi update nahi karenge)
        stockUpdates.push({
          ref: productRefs[index],
          newStock: productData.stockQuantity - requestedQty
        });
      });

      // Discount Calculation
      let discount = 0;
      if (couponSnap && !couponSnap.empty) {
        const couponData = couponSnap.docs[0].data();
        if (calculatedTotal >= couponData.minOrderAmount) {
          discount = couponData.discountAmount;
        }
      }

      // Delivery Fee Calculation
      const deliveryConfig = settingsSnap.exists ? settingsSnap.data() : { baseFee: 10, freeAbove: 100 };
      let deliveryFee = 0;
      if (customerDetails.orderType === "Delivery") {
        deliveryFee = calculatedTotal >= deliveryConfig.freeAbove ? 0 : deliveryConfig.baseFee;
      }

      const finalAmount = Math.max(0, calculatedTotal - discount + deliveryFee);
      const uniqueOrderId = "ORD-" + crypto.randomInt(100000, 999999).toString();

      const orderData = {
        orderId: uniqueOrderId,
        customerId: uid,
        items: finalItems,
        cartTotal: calculatedTotal,
        discount: discount,
        promoCodeUsed: discount > 0 ? couponCode : null,
        deliveryFee: deliveryFee,
        totalAmount: finalAmount,
        customerDetails: {
          name: customerDetails.name,
          phone: customerDetails.phone,
          address: customerDetails.address || "Store Pickup",
          mapLink: customerDetails.mapLink || "",
          orderType: customerDetails.orderType,
          paymentMethod: customerDetails.paymentMethod
        },
        status: "Pending",
        orderDate: new Date() // Server timestamp
      };


      // ================= PHASE 3: SIRF WRITE (SET/UPDATE) KARENGE =================
      
      // 3A. Saare products ka naya stock ek sath update karein
      stockUpdates.forEach(update => {
        transaction.update(update.ref, { stockQuantity: update.newStock });
      });

      // 3B. Naya order database mein daalein
      transaction.set(orderRef, orderData);

    }); // Transaction yahan safely khatam hogi

    return NextResponse.json({ success: true, message: "Order placed securely!" }, { status: 200 });

  } catch (error) {
    console.error("Checkout Security Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to process order securely." }, { status: 500 });
  }
}