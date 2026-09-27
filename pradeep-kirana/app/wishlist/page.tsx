"use client";

import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, Trash2, Plus, Minus, Home, Package, ShoppingBag } from "lucide-react";

export default function WishlistPage() {
  const router = useRouter();
  const { wishlist, toggleWishlist } = useWishlist() as any;
  const { cart, addToCart, removeFromCart } = useCart() as any;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-32 font-sans transition-colors">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        
        {/* Header */}
        <header className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => router.push('/')} 
            className="p-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-full shadow-sm hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition"
          >
            <ArrowLeft className="text-gray-800 dark:text-gray-200" size={20} />
          </button>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Heart className="text-red-500 fill-current" size={24} /> Saved Essentials
          </h1>
        </header>

        {wishlist.length === 0 ? (
          <div className="text-center bg-white dark:bg-[#121212] p-12 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 mt-10">
            <Heart className="mx-auto text-gray-300 dark:text-gray-700 mb-4" size={64} />
            <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No saved essentials yet!</h2>
            <p className="text-gray-500 mb-6 text-sm">Tap the heart icon on any product to save it here for quick access.</p>
            <button 
              onClick={() => router.push('/')} 
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition shadow-md"
            >
              Explore Store
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {wishlist.map((product: any) => {
              const inCart = cart.find((item: any) => item.id === product.id)?.cartQuantity || 0;
              const isOutOfStock = product.stockQuantity <= 0;

              return (
                <div key={product.id} className="bg-white dark:bg-[#121212] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex gap-4 items-center relative transition-colors">
                  
                  {/* Remove Button */}
                  <button 
                    onClick={() => toggleWishlist(product)} 
                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition p-1"
                    title="Remove from saved"
                  >
                    <Trash2 size={18} />
                  </button>

                  <div className="w-20 h-20 bg-gray-50 dark:bg-[#1e1e1e] rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-gray-100 dark:border-gray-800">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-green-600 font-bold text-xl">{product.name.charAt(0)}</span>
                    )}
                  </div>

                  <div className="flex-1 pr-6">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1">{product.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{product.unit}</p>
                    <p className="font-extrabold text-green-600 dark:text-green-500 text-sm mb-3">₹{product.price}</p>

                    {!isOutOfStock ? (
                      inCart > 0 ? (
                        <div className="inline-flex items-center bg-green-600 text-white rounded-lg shadow-sm">
                          <button onClick={() => removeFromCart(product.id)} className="p-1.5 hover:bg-green-700 rounded-l-lg"><Minus size={14}/></button>
                          <span className="px-3 font-bold text-xs">{inCart}</span>
                          <button onClick={() => addToCart(product)} disabled={inCart >= product.stockQuantity} className="p-1.5 hover:bg-green-700 rounded-r-lg disabled:opacity-50"><Plus size={14}/></button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => addToCart(product)} 
                          className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600 hover:text-white transition"
                        >
                          Add to Cart
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-red-500 font-bold">Out of Stock</span>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-white dark:bg-[#121212] border-t border-gray-200 dark:border-gray-800 z-50 py-2.5 px-8 flex justify-around items-center shadow-2xl">
        <button onClick={() => router.push('/')} className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-green-600 transition font-semibold text-xs"><Home size={22} /><span>Home</span></button>
        <button onClick={() => router.push('/wishlist')} className="flex flex-col items-center gap-1 text-green-600 dark:text-green-500 font-bold text-xs"><Heart size={22} /><span>Saved</span></button>
        <button onClick={() => router.push('/orders')} className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-green-600 transition font-semibold text-xs"><Package size={22} /><span>Orders</span></button>
      </nav>

    </div>
  );
}