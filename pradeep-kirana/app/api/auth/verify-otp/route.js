import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

export async function POST(req) {
  try {
    const header = req.headers.get("authorization") || "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    
    if (!idToken) return NextResponse.json({ success: false, error: "Unauthorized: Google login token missing" }, { status: 401 });

    // 1. Verify Google User Identity
    let uid;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (tokenErr) {
      return NextResponse.json({ success: false, error: "Session expired. Please sign in with Google again." }, { status: 401 });
    }

    const { phone, otp } = await req.json();

    if (!phone || !otp) {
      return NextResponse.json({ success: false, error: "Phone and OTP are required." }, { status: 400 });
    }

    // 2. Fetch Saved OTP from Firestore
    const otpDocRef = adminDb.collection("otps").doc(phone);
    const otpDoc = await otpDocRef.get();

    if (!otpDoc.exists) {
      return NextResponse.json({ success: false, error: "No OTP request found for this number." }, { status: 400 });
    }

    const otpData = otpDoc.data();

    // 3. Security Checks (Attempts & Expiry)
    if (otpData.attempts >= 3) {
      await otpDocRef.delete();
      return NextResponse.json({ success: false, error: "Too many failed attempts. Request a new OTP." }, { status: 400 });
    }

    if (Date.now() > otpData.expiresAt) {
      await otpDocRef.delete();
      return NextResponse.json({ success: false, error: "OTP has expired." }, { status: 400 });
    }

    if (String(otpData.otp) !== String(otp)) {
      await otpDocRef.update({ attempts: (otpData.attempts || 0) + 1 });
      return NextResponse.json({ success: false, error: "Invalid OTP. Please try again." }, { status: 400 });
    }

    // 4. OTP Correct! Delete it and Link Phone Number
    await otpDocRef.delete();
    const formattedPhone = `+91${phone}`;

    try {
      await adminAuth.updateUser(uid, {
        phoneNumber: formattedPhone
      });
    } catch (firebaseErr) {
      if (firebaseErr.code === 'auth/phone-number-already-exists') {
        return NextResponse.json({ success: false, error: "This phone number is already linked to another account." }, { status: 400 });
      }
      throw firebaseErr; // Pass other errors to the main catch block
    }

    // 5. Securely Save Phone to Users Collection in Firestore
    await adminDb.collection("users").doc(uid).set({
      phone: formattedPhone,
      updatedAt: new Date()
    }, { merge: true });

    return NextResponse.json({ success: true, message: "Phone number verified securely." });

  } catch (error) {
    console.error("🔥 VERIFY OTP BACKEND CRASH:", error);
    // Ab agar crash hoga, toh frontend par exact error message dikhega
    return NextResponse.json({ success: false, error: `Backend Error: ${error.message}` }, { status: 500 });
  }
}