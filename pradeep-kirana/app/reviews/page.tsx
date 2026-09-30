"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Star, MessageSquare, ArrowLeft, Trash2, Edit2, AlertTriangle, CheckCircle2, X } from "lucide-react";

export default function MyReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' }>({ show: false, message: "", type: 'success' });
  
  const [editModal, setEditModal] = useState<{show: boolean, review: any}>({show: false, review: null});
  const [editRating, setEditRating] = useState(0);
  const [editReviewText, setEditReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const q = query(collection(db, "reviews"), where("customerId", "==", currentUser.uid));
        const unsubReviews = onSnapshot(q, (snapshot) => {
          const revData: any[] = [];
          snapshot.forEach((docSnap) => { revData.push({ id: docSnap.id, ...docSnap.data() }); });
          // Sort latest first
          revData.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
          setReviews(revData);
          setLoading(false);
        });
        return () => unsubReviews();
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleDelete = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this review?")) return;
    
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      const response = await fetch(`/api/reviews?productId=${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await response.json();
      
      if (data.success) {
        showToast("Review deleted successfully.", "success");
      } else {
        showToast(data.error || "Failed to delete.", "error");
      }
    } catch (e) {
      showToast("Error deleting review.", "error");
    }
  };

  const openEditModal = (review: any) => {
    setEditRating(review.rating);
    setEditReviewText(review.reviewText);
    setEditModal({ show: true, review });
  };

  const handleUpdateReview = async () => {
    if (editRating === 0) { showToast("Select a star rating.", "error"); return; }
    setIsSubmitting(true);
    
    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      const response = await fetch('/api/reviews', {
        method: 'POST', // POST acts as UPSERT
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({
          productId: editModal.review.productId,
          ratingVal: editRating,
          reviewText: editReviewText
        })
      });
      
      const data = await response.json();
      if (data.success) {
        showToast("Review updated successfully!", "success");
        setEditModal({ show: false, review: null });
      } else {
        showToast(`Failed: ${data.error}`, "error");
      }
    } catch (error) {
      showToast("Failed to update review.", "error");
    }
    setIsSubmitting(false);
  };

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-50 dark:bg-[#0a0a0a]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-4 md:p-8">
      
      {toast.show && (
        <div className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] w-11/12 max-w-md p-4 rounded-2xl shadow-2xl flex items-center justify-between border animate-in slide-in-from-top-5 duration-300 ${toast.type === 'success' ? 'bg-green-600 border-green-400' : 'bg-red-600 border-red-400'} text-white`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-full shrink-0">
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Notification</p>
              <p className="text-sm font-extrabold leading-tight">{toast.message}</p>
            </div>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="p-1 hover:bg-black/20 rounded-full"><X size={18} /></button>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        <header className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/')} className="p-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-full shadow-sm hover:bg-gray-100 transition"><ArrowLeft size={20} className="text-gray-800 dark:text-white" /></button>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">My Reviews</h1>
        </header>

        {reviews.length === 0 ? (
          <div className="text-center bg-white dark:bg-[#121212] p-10 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
            <MessageSquare className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
            <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No reviews yet!</h2>
            <p className="text-gray-500 mb-6 text-sm">Share your experience about the products you bought.</p>
            <button onClick={() => router.push('/')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition shadow-md">Start Shopping</button>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="bg-white dark:bg-[#121212] p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1">{review.productName}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEditModal(review)} className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 transition"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(review.productId)} className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 transition"><Trash2 size={16} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} size={16} className={star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-gray-700"} />
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{review.reviewText}</p>
                <p className="text-[10px] text-gray-400 mt-3">{review.updatedAt?.toDate ? review.updatedAt.toDate().toLocaleDateString() : 'Just now'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editModal.show && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">Edit Review</h3>
              <button onClick={() => setEditModal({show: false, review: null})} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition"><X size={20}/></button>
            </div>
            
            <p className="text-sm font-semibold mb-3 text-gray-600 dark:text-gray-400">{editModal.review.productName}</p>
            
            <div className="flex items-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setEditRating(star)} className="p-1 hover:scale-110 transition-transform">
                  <Star size={28} className={star <= editRating ? "fill-yellow-400 text-yellow-400" : "text-gray-300 dark:text-gray-600"} />
                </button>
              ))}
            </div>
            
            <textarea 
              value={editReviewText} 
              onChange={(e) => setEditReviewText(e.target.value)} 
              placeholder="Update your review..." 
              className="w-full bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-green-500 outline-none resize-none mb-4" 
              rows={3}
            />
            
            <button onClick={handleUpdateReview} disabled={isSubmitting} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-md disabled:opacity-50">
              {isSubmitting ? "Updating..." : "Update Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}