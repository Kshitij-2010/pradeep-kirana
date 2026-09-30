import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin"; // Aapki firebaseAdmin.js file ka path

export async function POST(req) { // req ke aage se type hata diya
  try {
    const body = await req.json();
    const { productId, ratingVal, reviewText, customerName, uid } = body;

    // 1. Strict Validation: Hacker negative rating ya 1000 star rating nahi bhej sakta
    if (!uid || !productId || typeof ratingVal !== 'number' || ratingVal < 1 || ratingVal > 5) {
      return NextResponse.json({ success: false, error: "Invalid review data" }, { status: 400 });
    }

    // 2. Atomic Transaction: Review add karo aur Product ki rating secure server par update karo
    await adminDb.runTransaction(async (transaction) => {
      const productRef = adminDb.collection("items").doc(productId);
      const productSnap = await transaction.get(productRef);

      if (!productSnap.exists) throw new Error("Product not found");

      const data = productSnap.data();

      // Naya Review Add karein
      const newReviewRef = adminDb.collection("reviews").doc();
      transaction.set(newReviewRef, {
        productId,
        productName: data.name,
        customerName: customerName || "Customer",
        customerId: uid,
        rating: ratingVal,
        // Text ko 1000 characters pe limit karo taaki database full na ho
        reviewText: reviewText ? reviewText.substring(0, 1000) : "", 
        createdAt: new Date()
      });

      // Product ke andar Total Rating badhayein
      transaction.update(productRef, {
        ratingSum: (data.ratingSum || 0) + ratingVal,
        ratingCount: (data.ratingCount || 0) + 1
      });
    });

    return NextResponse.json({ success: true, message: "Review submitted successfully!" }, { status: 200 });

  } catch (error) { // error ke aage se 'any' hata diya
    console.error("Review Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to submit review" }, { status: 500 });
  }
}