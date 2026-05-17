import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LogIn, UserPlus } from "lucide-react";

interface IntroScreenProps {
  onFinish: () => void;
  onLogin: () => void;
  isAuthenticated: boolean;
}

export default function IntroScreen({ onFinish, onLogin, isAuthenticated }: IntroScreenProps) {
  const [phase, setPhase] = useState<"splash" | "welcome">("splash");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        onFinish();
      } else {
        setPhase("welcome");
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, onFinish]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        {phase === "splash" ? (
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center p-8 w-full h-full bg-[#1A1A1A]"
          >
            <img 
              src="https://plain-eeur-prod-public.komododecks.com/202605/17/ZX368D8AEumtda2CvZlY/image.gif" 
              alt="RouteMate Intro" 
              className="w-full max-w-sm rounded-[40px] shadow-2xl"
            />
          </motion.div>
        ) : (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center justify-between w-full h-full max-w-md mx-auto p-12 bg-parchment"
          >
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12 }}
                className="mb-8"
              >
                <img 
                  src="https://plain-eeur-prod-public.komododecks.com/202605/17/BHWbb1qYQe1XYZLo9exD/image.png" 
                  alt="RouteMate Logo" 
                  className="w-24 h-24 rounded-3xl shadow-xl border-4 border-white"
                />
              </motion.div>
              
              <h1 className="text-4xl font-extrabold text-charcoal tracking-tight mb-4">
                RouteMate
              </h1>
              <p className="text-lg text-slate-500 font-medium leading-relaxed max-w-[280px]">
                Un logon ke liye jo daily ek hi raste se aate jate hain
              </p>
            </div>

            <div className="w-full space-y-4 mb-8">
              <button
                onClick={onLogin}
                className="w-full bg-sage text-white rounded-[24px] py-5 font-bold shadow-2xl shadow-sage/30 hover:bg-sage/90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg"
              >
                <LogIn size={22} strokeWidth={2.5} />
                Login with Google
              </button>
              
              <button
                onClick={onLogin}
                className="w-full bg-white text-charcoal border-2 border-sand rounded-[24px] py-5 font-bold hover:bg-sand/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg"
              >
                <UserPlus size={22} strokeWidth={2.5} />
                Sign Up
              </button>
            </div>
            
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-[0.2em]">
              Safe • Reliable • Together
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
