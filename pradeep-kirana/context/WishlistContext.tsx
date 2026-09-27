"use client";

import { createContext, useContext, useState, useEffect } from "react";

const WishlistContext = createContext({});

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [wishlist, setWishlist] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("pradeep_wishlist");
    if (saved) {
      try { setWishlist(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const toggleWishlist = (product: any) => {
    setWishlist(prev => {
      const exists = prev.find(item => item.id === product.id);
      let updated;
      if (exists) {
        updated = prev.filter(item => item.id !== product.id);
      } else {
        updated = [...prev, product];
      }
      localStorage.setItem("pradeep_wishlist", JSON.stringify(updated));
      return updated;
    });
  };

  const isInWishlist = (id: string) => wishlist.some(item => item.id === id);

  return (
    <WishlistContext.Provider value={{ wishlist, toggleWishlist, isInWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
}

export const useWishlist = () => useContext(WishlistContext);