export default function StoreLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={className} 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background Rounded Box */}
      <rect width="100" height="100" rx="24" className="fill-green-600 dark:fill-green-500" />
      
      {/* Shopping Bag Shape */}
      <path 
        d="M30 38H70V72C70 75.3137 67.3137 78 64 78H36C32.6863 78 30 75.3137 30 72V38Z" 
        fill="white" 
        fillOpacity="0.15" 
      />
      <path 
        d="M32 38H68V72C68 74.2091 66.2091 76 64 76H36C33.7909 76 32 74.2091 32 72V38Z" 
        stroke="white" 
        strokeWidth="5" 
      />
      
      {/* Bag Handle */}
      <path 
        d="M40 38V30C40 25.5817 43.5817 22 48 22H52C56.4183 22 60 25.5817 60 30V38" 
        stroke="white" 
        strokeWidth="5" 
        strokeLinecap="round" 
      />
      
      {/* Speed Lightning / Blink Element */}
      <path 
        d="M52 42L41 57H53L47 70" 
        stroke="#FACC15" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  );
}