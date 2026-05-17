/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { auth, signInWithGoogle, logout, db } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, onSnapshot } from "firebase/firestore";
import { MapPin, User as UserIcon, PlusCircle, Activity as ActivityIcon, LogIn, LogOut, Car, Search, Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleMapsProvider } from "./lib/google-maps";

// Pages
import Home from "./pages/Home";
import Post from "./pages/Post";
import Activity from "./pages/Activity";
import Profile from "./pages/Profile";

type Tab = "home" | "post" | "activity" | "profile";

interface Notification {
  id: string;
  message: string;
  type: 'commute' | 'system';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [prefillRideData, setPrefillRideData] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Ensure user document exists
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName || "Anonymous User",
            email: user.email,
            createdAt: serverTimestamp(),
          });
        }
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Commute Notification Logic
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "trackingSessions"),
      where("participantIds", "array-contains", user.uid),
      where("status", "==", "EnRoute")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const checkCommutes = () => {
        const now = new Date();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDay = days[now.getDay()];
        
        activeSessions.forEach((session: any) => {
          if (!session.isRoutine || !session.activeDays?.includes(currentDay)) return;

          const checkTime = (timeStr: string, label: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const scheduled = new Date();
            scheduled.setHours(hours, minutes, 0, 0);
            
            const diffMinutes = (scheduled.getTime() - now.getTime()) / (1000 * 60);
            
            // If strictly within 55-65 mins range (to prevent spamming every minute)
            if (diffMinutes <= 60 && diffMinutes >= 58 || (diffMinutes <= 0 && diffMinutes >= -2)) {
              const notificationId = `${session.id}-${label}-${now.getDate()}`;
              if (!notifications.find(n => n.id === notificationId)) {
                setNotifications(prev => {
                   if (prev.find(p => p.id === notificationId)) return prev;
                   return [...prev, {
                      id: notificationId,
                      message: diffMinutes > 0 
                        ? `Your ${label} commute is in 1 hour!` 
                        : `Your ${label} commute has started!`,
                      type: 'commute'
                    }];
                });
              }
            }
          };

          if (session.goingTime) checkTime(session.goingTime, "morning");
          if (session.returnTime) checkTime(session.returnTime, "evening");
        });
      };

      checkCommutes();
      const interval = setInterval(checkCommutes, 60000);
      return () => clearInterval(interval);
    });

    return unsubscribe;
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-parchment p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-[48px] shadow-2xl p-10 text-center border-8 border-sage/5"
        >
          <div className="bg-clay w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Car className="text-sage w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-charcoal mb-2">CarPool</h1>
          <p className="text-slate-500 mb-8 font-medium">Sustainable commutes for modern communities.</p>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-sage text-white rounded-2xl py-4 font-bold shadow-xl shadow-sage/20 hover:bg-sage/90 transition-all flex items-center justify-center gap-3"
          >
            <LogIn size={20} />
            Enter with Google
          </button>
        </motion.div>
      </div>
    );
  }

  const renderContent = () => {
    if (!user) return null;
    switch (activeTab) {
      case "home": return (
        <Home 
          user={user} 
          onRequestRide={(data) => {
            setPrefillRideData(data);
            setActiveTab("post");
          }} 
        />
      );
      case "post": return (
        <Post 
          onPostCreated={() => {
            setPrefillRideData(null);
            setActiveTab("home");
          }} 
          user={user} 
          prefillData={prefillRideData}
          onCancelPrefill={() => setPrefillRideData(null)}
        />
      );
      case "activity": return <Activity />;
      case "profile": return <Profile user={user} onLogout={logout} />;
      default: return <Home user={user} />;
    }
  };

  return (
    <GoogleMapsProvider>
      <div className="min-h-screen bg-parchment flex justify-center">
        <div className="w-full bg-white min-h-screen relative flex flex-col shadow-sm overflow-hidden">
          {/* Notifications Banner */}
          <div className="fixed top-20 left-0 right-0 z-[60] px-6 pointer-events-none">
            <AnimatePresence>
              {notifications.map((notif) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  className="bg-sage text-white p-4 rounded-2xl shadow-2xl mb-3 flex items-center justify-between border border-white/20 pointer-events-auto backdrop-blur-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-xl">
                      <Bell size={18} />
                    </div>
                    <p className="text-xs font-bold tracking-tight">{notif.message}</p>
                  </div>
                  <button 
                    onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                    className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Header */}
          <header className="px-6 py-5 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-clay flex items-center justify-center font-bold text-sage">
                {user.displayName?.charAt(0) || "U"}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">CarPool</p>
                <h1 className="text-base font-bold leading-tight text-charcoal">{user.displayName?.split(' ')[0]}</h1>
              </div>
            </div>
            {notifications.length > 0 && (
              <div className="relative">
                <Bell size={20} className="text-sage animate-bounce" />
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
              </div>
            )}
          </header>

            {/* Content Area */}
            <main className="flex-1 pb-24 overflow-y-auto bg-white">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </main>

            {/* Bottom Navigation */}
            <nav className="h-20 bg-white border-t border-gray-100 flex items-center justify-around px-4 z-50">
              <NavButton 
                active={activeTab === "home"} 
                onClick={() => setActiveTab("home")} 
                icon={<MapPin />} 
                label="Home" 
              />
              <NavButton 
                active={activeTab === "post"} 
                onClick={() => setActiveTab("post")} 
                icon={<PlusCircle />} 
                label="Post" 
              />
              <NavButton 
                active={activeTab === "activity"} 
                onClick={() => setActiveTab("activity")} 
                icon={<ActivityIcon />} 
                label="Track" 
              />
              <NavButton 
                active={activeTab === "profile"} 
                onClick={() => setActiveTab("profile")} 
                icon={<UserIcon />} 
                label="Me" 
              />
            </nav>
        </div>
      </div>
    </GoogleMapsProvider>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all ${active ? 'text-sage' : 'text-gray-300'}`}
    >
      <div className="relative">
        {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: active ? 2.5 : 2 })}
        {active && (
          <motion.div 
            layoutId="nav-dot" 
            className="absolute -top-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-sage rounded-full"
          />
        )}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}
