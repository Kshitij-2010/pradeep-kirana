// app/api/reviews/route.js
import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

const rateLimit = new Map();

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (e) {
      return NextResponse.json({ success: false, error: "Invalid Token" }, { status: 401 });
    }
    
    const uid = decodedToken.uid;
    const realCustomerName = decodedToken.name || "Customer";

    const now = Date.now();
    if (rateLimit.has(uid) && now - rateLimit.get(uid) < 5000) {
      return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
    }
    rateLimit.set(uid, now);

    const body = await req.json();
    const { productId, ratingVal, reviewText } = body;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ success: false, error: "Invalid Product ID" }, { status: 400 });
    }
    
    const rating = Number(ratingVal);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, error: "Rating must be an integer between 1 and 5" }, { status: 400 });
    }

    const sanitizedText = String(reviewText || "").trim().substring(0, 500);

    const productRef = adminDb.collection("items").doc(productId);
    const productSnap = await productRef.get();
    
    if (!productSnap.exists) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    // 1 User = 1 Review per product
    const reviewDocId = `${productId}_${uid}`;
    const reviewRef = adminDb.collection("reviews").doc(reviewDocId);
    
    const reviewDoc = await reviewRef.get();
    let ratingDifference = rating;
    let isNewReview = true;

    if (reviewDoc.exists) {
      isNewReview = false;
      const oldRating = reviewDoc.data().rating;
      ratingDifference = rating - oldRating; 
    }

    const batch = adminDb.batch();
    
    batch.set(reviewRef, {
      productId: productId,
      productName: productSnap.data().name,
      customerId: uid,
      customerName: realCustomerName, 
      rating: rating,
      reviewText: sanitizedText,
      updatedAt: new Date(),
      ...(isNewReview && { createdAt: new Date() })
    }, { merge: true });

    if (isNewReview) {
      batch.update(productRef, {
        ratingSum: (productSnap.data().ratingSum || 0) + rating,
        ratingCount: (productSnap.data().ratingCount || 0) + 1
      });
    } else if (ratingDifference !== 0) {
      batch.update(productRef, {
        ratingSum: (productSnap.data().ratingSum || 0) + ratingDifference
      });
    }

    await batch.commit();
    return NextResponse.json({ success: true, message: "Review saved safely!" }, { status: 200 });

  } catch (error) {
    console.error("Review Security Error:", error);
    return NextResponse.json({ success: false, error: "Failed to submit review safely." }, { status: 500 });
  }
}

// NAYA DELETE FUNCTION 
export async function DELETE(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (e) {
      return NextResponse.json({ success: false, error: "Invalid Token" }, { status: 401 });
    }
    const uid = decodedToken.uid;

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) return NextResponse.json({ success: false, error: "Missing Product ID" }, { status: 400 });

    const reviewDocId = `${productId}_${uid}`;
    const reviewRef = adminDb.collection("reviews").doc(reviewDocId);
    const reviewDoc = await reviewRef.get();

    if (!reviewDoc.exists) {
      return NextResponse.json({ success: false, error: "Review not found" }, { status: 404 });
    }

    const rating = reviewDoc.data().rating;
    const batch = adminDb.batch();
    
    // Review Delete Karo
    batch.delete(reviewRef);

    // Product Rating Decrement Karo
    const productRef = adminDb.collection("items").doc(productId);
    const productSnap = await productRef.get();
    
    if (productSnap.exists) {
      const currentSum = productSnap.data().ratingSum || 0;
      const currentCount = productSnap.data().ratingCount || 0;
      batch.update(productRef, {
        ratingSum: Math.max(0, currentSum - rating),
        ratingCount: Math.max(0, currentCount - 1)
      });
    }

    await batch.commit();
    return NextResponse.json({ success: true, message: "Review deleted safely!" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to delete review." }, { status: 500 });
  }
}