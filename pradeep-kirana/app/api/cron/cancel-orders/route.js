import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin"; // Apna admin firebase import karein

export async function GET(req) {
  try {
    // 10 Minute pehle ka time calculate karein
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    // Sirf 'Pending' orders fetch karein
    const ordersRef = adminDb.collection("orders");
    const snapshot = await ordersRef.where("status", "==", "Pending").get();

    let cancelledCount = 0;
    const batch = adminDb.batch();

    snapshot.forEach((doc) => {
      const data = doc.data();
      
      // Check karein ki order Delivery type ka hai ya nahi
      const isDelivery = data.deliveryType === "Delivery" || data.customerDetails?.orderType === "Delivery";
      
      if (isDelivery) {
        let orderTimeMs = 0;
        
        // Firebase Admin Timestamp parsing
        if (data.orderDate?._seconds) {
          orderTimeMs = data.orderDate._seconds * 1000;
        } else if (data.orderDate?.toDate) {
          orderTimeMs = data.orderDate.toDate().getTime();
        } else if (data.orderDate) {
          orderTimeMs = new Date(data.orderDate).getTime();
        }

        // Agar order time 10 minute pehle se bhi purana hai, toh usko batch cancel mein daal do
        if (orderTimeMs > 0 && orderTimeMs < tenMinutesAgo.getTime()) {
          batch.update(doc.ref, {
            status: "Cancelled",
            cancelReason: "Auto-Cancelled: No delivery partner accepted the order within 10 minutes.",
            cancelledAt: new Date(),
          });
          cancelledCount++;
        }
      }
    });

    // Agar koi order mila cancel karne ke liye, toh database update kar do
    if (cancelledCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      message: `Checked pending orders. Auto-cancelled ${cancelledCount} old orders.` 
    });

  } catch (error) {
    console.error("Auto Cancel Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}