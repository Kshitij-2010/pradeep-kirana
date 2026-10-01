"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { Store, ShieldCheck, Loader2, UserCircle, MessageCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  
  const [step, setStep] = useState<"GOOGLE" | "PHONE" | "OTP">("GOOGLE");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Google Sign In
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if user already has a phone number linked
      const hasPhoneLinked = user.providerData.some((provider) => provider.providerId === "phone") || !!user.phoneNumber;

      if (hasPhoneLinked) {
        // Already fully verified! Let them in.
        router.push("/"); 
      } else {
        // Needs Phone Verification
        setStep("PHONE");
      }
    } catch (err: any) {
      setError(`Google Login failed: ${err.message}`);
      console.error(err);
    }
    setLoading(false);
  };

  // Step 2: Send WhatsApp OTP via Backend API
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      
      const res = await fetch("/api/auth/send-whatsapp-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanNumber })
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send WhatsApp OTP.");
      }
      
      setStep("OTP");
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    }
    setLoading(false);
  };

  // Step 3: Verify OTP securely via our Backend API
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please complete Google Login first.");
      
      const idToken = await currentUser.getIdToken(true);
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}` 
        },
        body: JSON.stringify({ phone: cleanNumber, otp: otp })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Verification failed.");
      }

      // 🔴 FRONTEND SYNC: Refresh user session so frontend knows phone is verified!
      await currentUser.reload(); 

      // Success! Go back to Home
      router.push("/");
      
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex flex-col items-center justify-center p-4 selection:bg-green-200">
      <div className="w-full max-w-md bg-white dark:bg-[#121212] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        
        {/* Header */}
        <div className="bg-green-600 p-6 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-black/10"></div>
          <div className="relative z-10 flex justify-center mb-3">
            <div className="bg-white p-3 rounded-2xl shadow-lg">
              <Store size={32} className="text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-white relative z-10 tracking-tight">Pradeep Kirana</h1>
          <p className="text-green-100 text-sm font-medium relative z-10 mt-1">Secure Customer Login</p>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm font-bold mb-6 text-center border border-red-200 dark:border-red-800/50 animate-in slide-in-from-top-2">
              {error}
            </div>
          )}

          {/* VIEW 1: GOOGLE LOGIN */}
          {step === "GOOGLE" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-8">
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">Welcome Back!</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Sign in with your Google account to track orders and save your wishlist.</p>
              </div>

              <button 
                onClick={handleGoogleLogin} 
                disabled={loading}
                className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-extrabold py-3.5 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-70"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <><UserCircle size={20} /> Sign in with Google</>}
              </button>
            </div>
          )}

          {/* VIEW 2: WHATSAPP NUMBER INPUT */}
          {step === "PHONE" && (
            <form onSubmit={handleSendOtp} className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <MessageCircle size={24} />
                </div>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">WhatsApp Verification</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">We will send a secure OTP to your WhatsApp number.</p>
              </div>

              <div className="flex bg-gray-50 dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-gray-700 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition overflow-hidden mb-6">
                <span className="px-4 py-3.5 font-bold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-[#222]">
                  +91
                </span>
                <input 
                  type="tel" 
                  maxLength={10} 
                  required
                  autoFocus
                  placeholder="WhatsApp Number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-transparent px-4 py-3.5 outline-none font-bold text-lg text-gray-900 dark:text-white tracking-wide placeholder:text-gray-300 dark:placeholder:text-gray-600"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading || phoneNumber.length < 10}
                className="w-full bg-[#25D366] text-white font-extrabold py-3.5 rounded-xl hover:bg-[#1DA851] transition disabled:opacity-50 active:scale-95 flex justify-center items-center gap-2 shadow-md"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <><MessageCircle size={20}/> Send WhatsApp OTP</>}
              </button>
            </form>
          )}

          {/* VIEW 3: OTP VERIFICATION */}
          {step === "OTP" && (
            <form onSubmit={handleVerifyOtp} className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={24} />
                </div>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">Verify OTP</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Enter the 6-digit code sent to +91 {phoneNumber}</p>
              </div>

              <input 
                type="text" 
                maxLength={6} 
                required
                autoFocus
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 p-4 rounded-xl text-center text-3xl font-black tracking-[0.5em] outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition mb-6 text-gray-900 dark:text-white"
              />

              <button 
                type="submit" 
                disabled={loading || otp.length < 6}
                className="w-full bg-green-600 text-white font-extrabold py-3.5 rounded-xl hover:bg-green-700 transition disabled:opacity-50 active:scale-95 flex justify-center items-center gap-2 shadow-md"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <><ShieldCheck size={20} /> Verify & Complete Setup</>}
              </button>
            </form>
          )}
        </div>
      </div>
      
      <button onClick={() => router.push("/")} className="mt-8 text-sm font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1 transition">
        ← Back to Store
      </button>
    </div>
  );
}