import type { Metadata } from "next";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext"; // Wishlist import kiya
import "./globals.css";

export const metadata: Metadata = {
  title: "Pradeep Kirana Store",
  description: "Blink speed grocery delivery in Unnao.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Ye deep dark background aur smooth transition dega */}
      <body className="bg-gray-50 text-gray-900 dark:bg-[#0a0a0a] dark:text-gray-100 min-h-screen transition-colors duration-300">
        <CartProvider>
          <WishlistProvider> {/* Yahan WishlistProvider wrap kiya */}
            {children}
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}