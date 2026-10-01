import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin"; 

export async function POST(req) {
  try {
    const { phone } = await req.json();

    if (!phone || phone.length !== 10) {
      return NextResponse.json({ success: false, error: "Invalid phone number." }, { status: 400 });
    }

    // 1. Generate 6-digit random OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    // 2. Save OTP to Firestore securely
    await adminDb.collection("otps").doc(phone).set({
      otp: otp,
      expiresAt: expiresAt,
      attempts: 0
    });

    // 3. Send WhatsApp Message (Only if API Keys exist)
    const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID; 
    const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;

    if (WA_PHONE_NUMBER_ID && WA_ACCESS_TOKEN) {
      try {
        const response = await fetch(`https://graph.facebook.com/v17.0/${WA_PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WA_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: `91${phone}`, // India country code
            type: "template",
            template: {
              name: "auth_otp",
              language: { code: "en" },
              components: [{ type: "body", parameters: [{ type: "text", text: otp }] }]
            }
          })
        });

        const waData = await response.json();
        if (waData.error) {
          console.error("Meta API Error:", waData.error.message);
          // Don't throw error during testing, just log it so the app doesn't crash
        }
      } catch (fetchError) {
        console.error("Failed to reach WhatsApp API:", fetchError);
      }
    } else {
      console.log("⚠️ WhatsApp API keys not found. Skipping real message sending.");
    }

    // 4. ALWAYS print OTP in the console during development
    if (process.env.NODE_ENV === "development" || !WA_ACCESS_TOKEN) {
      console.log(`\n========================================`);
      console.log(`🟢 [TEST MODE] WhatsApp OTP for ${phone} is: ${otp}`);
      console.log(`========================================\n`);
    }

    return NextResponse.json({ success: true, message: "WhatsApp OTP processed successfully." });

  } catch (error) {
    console.error("WhatsApp API Route Error:", error);
    return NextResponse.json({ success: false, error: "Server error sending OTP." }, { status: 500 });
  }
}