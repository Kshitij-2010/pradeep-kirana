import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req) {
  try {
    // 1. Token verify karo
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // 2. Server khud Firebase Auth se verified user data mangwayega (Client ka data ignore)
    const userRecord = await adminAuth.getUser(uid);
    const verifiedPhone = userRecord.phoneNumber;

    if (!verifiedPhone) {
      return NextResponse.json({ 
        success: false, 
        error: "No verified phone number found in Firebase Auth." 
      }, { status: 400 });
    }

    // 3. Firestore mein secure update (Backend se)
    const userRef = adminDb.collection("users").doc(uid);
    await userRef.set({
      phone: verifiedPhone,
      updatedAt: new Date()
    }, { merge: true });

    return NextResponse.json({ success: true, phone: verifiedPhone }, { status: 200 });

  } catch (error) {
    console.error("Phone Sync Error:", { message: error.message, code: error.code });
    return NextResponse.json({ success: false, error: "Server error updating phone number." }, { status: 500 });
  }
}