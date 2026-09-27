"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  unit: string;
  imageUrl?: string;
  stockQuantity: number;
  cartQuantity: number;
}

export interface CartContextType {
  cart: CartItem[];
  addToCart: (product: any) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedCart = localStorage.getItem("pradeep_cart");
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error("Failed to parse cart from localStorage", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("pradeep_cart", JSON.stringify(cart));
    }
  }, [cart, isMounted]);

  const addToCart = (product: any) => {
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === product.id);
      if (existing) {
        return prevCart.map(item => 
          item.id === product.id 
            ? { ...item, cartQuantity: item.cartQuantity + 1 } 
            : item
        );
      } else {
        return [...prevCart, { ...product, cartQuantity: 1 }];
      }
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === productId);
      if (existing && existing.cartQuantity > 1) {
        return prevCart.map(item => 
          item.id === productId 
            ? { ...item, cartQuantity: item.cartQuantity - 1 } 
            : item
        );
      } else {
        return prevCart.filter(item => item.id !== productId);
      }
    });
  };

  const clearCart = () => {
    setCart([]);
    localStorage.removeItem("pradeep_cart");
  };

  const cartTotal = cart.reduce((total, item) => total + (item.price * item.cartQuantity), 0);
  const cartCount = cart.reduce((count, item) => count + item.cartQuantity, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, cartTotal, cartCount, isCartOpen, setIsCartOpen }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}