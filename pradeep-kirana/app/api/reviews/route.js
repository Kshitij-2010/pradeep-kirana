import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

const jsonError = (error, status = 400) =>
  NextResponse.json({ success: false, error }, { status });

const getBearerToken = (req) => {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
};

export async function POST(req) {
  let uid;
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("Unauthorized", 401);
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (e) {
      return jsonError("Invalid Token", 401);
    }
    
    uid = decodedToken.uid;
    const realCustomerName = decodedToken.name || "Customer";

    const body = await req.json();
    const { productId, ratingVal, reviewText } = body;

    if (!productId || typeof productId !== 'string') {
      return jsonError("Invalid Product ID", 400);
    }
    
    const rating = Number(ratingVal);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonError("Rating must be an integer between 1 and 5", 400);
    }

    const sanitizedText = String(reviewText || "").trim().substring(0, 500);

    // Ye trick guarantee karti hai ki ek user 1 hi review de paye
    const reviewDocId = `${productId}_${uid}`;
    const reviewRef = adminDb.collection("reviews").doc(reviewDocId);
    const productRef = adminDb.collection("items").doc(productId);

    // Transaction ensures ki product rating aur review ek sath update ho
    await adminDb.runTransaction(async (transaction) => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) {
        const err = new Error("Product not found");
        err.statusCode = 404;
        throw err;
      }

      const reviewDoc = await transaction.get(reviewRef);
      let ratingDifference = rating;
      let isNewReview = true;

      // Agar review pehle se hai, toh sirf edit hoga aur difference calculate hoga
      if (reviewDoc.exists) {
        isNewReview = false;
        const oldRating = reviewDoc.data().rating;
        ratingDifference = rating - oldRating;
      }

      const productData = productSnap.data();
      
      // Save or Update the review (UPSERT)
      transaction.set(reviewRef, {
        productId: productId,
        productName: productData.name,
        customerId: uid,
        customerName: realCustomerName,
        rating: rating,
        reviewText: sanitizedText,
        updatedAt: new Date(),
        ...(isNewReview && { createdAt: new Date() })
      }, { merge: true });

      // Update product's total stars based on whether it's new or an edit
      if (isNewReview) {
        transaction.update(productRef, {
          ratingSum: (productData.ratingSum || 0) + rating,
          ratingCount: (productData.ratingCount || 0) + 1
        });
      } else if (ratingDifference !== 0) {
        transaction.update(productRef, {
          ratingSum: (productData.ratingSum || 0) + ratingDifference
        });
      }
    });

    return NextResponse.json({ success: true, message: "Review saved safely!" }, { status: 200 });

  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("Review POST Error:", { uid, message: error?.message, stack: error?.stack });
    
    if (process.env.NODE_ENV === "development") {
      return jsonError(error?.message || "Failed to submit review", status);
    }
    return jsonError("Failed to submit review.", status);
  }
}

export async function DELETE(req) {
  let uid;
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("Unauthorized", 401);
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (e) {
      return jsonError("Invalid Token", 401);
    }
    
    uid = decodedToken.uid;

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) return jsonError("Missing Product ID", 400);

    const reviewDocId = `${productId}_${uid}`;
    const reviewRef = adminDb.collection("reviews").doc(reviewDocId);
    const productRef = adminDb.collection("items").doc(productId);

    await adminDb.runTransaction(async (transaction) => {
      const reviewDoc = await transaction.get(reviewRef);
      if (!reviewDoc.exists) {
        const err = new Error("Review not found");
        err.statusCode = 404;
        throw err;
      }

      const productSnap = await transaction.get(productRef);
      const rating = reviewDoc.data().rating;
      
      // Delete the review document
      transaction.delete(reviewRef);

      // Decrement the product's total rating properly
      if (productSnap.exists) {
        const currentSum = productSnap.data().ratingSum || 0;
        const currentCount = productSnap.data().ratingCount || 0;
        transaction.update(productRef, {
          ratingSum: Math.max(0, currentSum - rating),
          ratingCount: Math.max(0, currentCount - 1)
        });
      }
    });

    return NextResponse.json({ success: true, message: "Review deleted safely!" }, { status: 200 });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("Review DELETE Error:", { uid, message: error?.message });
    
    if (process.env.NODE_ENV === "development") {
      return jsonError(error?.message || "Failed to delete review", status);
    }
    return jsonError("Failed to delete review.", status);
  }
}