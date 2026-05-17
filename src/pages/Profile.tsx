import React, { useState, useEffect } from "react";
import { LogOut, User as UserIcon, Settings, Shield, Bell, CreditCard, ChevronRight, Edit3, Check, X, Phone, MessageCircle } from "lucide-react";
import { User, updateProfile } from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { motion, AnimatePresence } from "motion/react";

export default function Profile({ user, onLogout }: { user: User, onLogout: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(user.displayName || "");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setPhone(data.phone || "");
        setWhatsapp(data.whatsapp || "");
      }
    };
    fetchUserData();
  }, [user.uid]);

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      if (newName !== user.displayName) {
        await updateProfile(user, { displayName: newName });
      }
      
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { 
        name: newName,
        phone,
        whatsapp
      });
      
      setIsEditing(false);
    } catch (e) {
      console.error("Error updating profile:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header Profile */}
      <div className="bg-white p-10 pt-4 pb-12 rounded-b-[48px] shadow-sm text-center border-b border-sand">
        <div className="relative inline-block mb-6">
          <div className="w-28 h-28 bg-clay rounded-[40px] flex items-center justify-center mx-auto shadow-inner overflow-hidden border-[6px] border-white ring-4 ring-parchment">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User"} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon className="text-sage w-14 h-14" />
            )}
          </div>
          <button 
            onClick={() => setIsEditing(true)}
            className="absolute -bottom-1 -right-1 bg-white p-2.5 rounded-2xl shadow-xl border border-sand hover:bg-sand transition-colors"
          >
            <Edit3 size={18} className="text-sage" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {isEditing ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center gap-4 mb-6"
            >
              <div className="w-full max-w-xs space-y-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest block text-left px-2">Display Name</label>
                  <input 
                    type="text" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full text-lg font-bold text-charcoal bg-sand p-3 rounded-2xl outline-none border-2 border-sage/10 focus:border-sage"
                    placeholder="Full Name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest block text-left px-2">Phone Number</label>
                  <div className="relative">
                    <input 
                      type="tel" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-sm font-bold text-charcoal bg-sand p-3 pl-10 rounded-2xl outline-none border-2 border-sage/10 focus:border-sage"
                      placeholder="+92 3XX XXXXXXX"
                    />
                    <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest block text-left px-2">WhatsApp Number</label>
                  <div className="relative">
                    <input 
                      type="tel" 
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      className="w-full text-sm font-bold text-charcoal bg-sand p-3 pl-10 rounded-2xl outline-none border-2 border-sage/10 focus:border-sage"
                      placeholder="+92 3XX XXXXXXX"
                    />
                    <MessageCircle size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#25D366]" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleUpdateProfile}
                  disabled={loading}
                  className="bg-sage text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-sage/20"
                >
                  <Check size={18} /> Save Profile
                </button>
                <button 
                  onClick={() => { setIsEditing(false); setNewName(user.displayName || ""); }}
                  className="bg-sand text-gray-400 p-3 rounded-2xl hover:bg-clay/50 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              <motion.h2 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-2xl font-bold text-charcoal tracking-tight mb-1"
              >
                {user.displayName}
              </motion.h2>
              <div className="flex items-center justify-center gap-4 mb-4">
                {phone && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 bg-sand px-3 py-1.5 rounded-full">
                    <Phone size={10} className="text-sage" /> {phone}
                  </div>
                )}
                {whatsapp && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 bg-sand px-3 py-1.5 rounded-full">
                    <MessageCircle size={10} className="text-[#25D366]" /> {whatsapp}
                  </div>
                )}
              </div>
            </>
          )}
        </AnimatePresence>
        
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-10 italic">Certified Member</p>
        
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Trips" value="24" />
          <StatBox label="Impact" value="4.9" />
          <StatBox label="CO2" value="12" sub="KG" />
        </div>
      </div>

      <div className="p-8 space-y-4">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] px-2 mb-2">Ecosystem</h3>
        <ProfileItem icon={<Bell size={20} />} label="Preferences" />
        <ProfileItem icon={<Shield size={20} />} label="Privacy Vault" />
        
        <div className="pt-8">
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center p-5 bg-sand text-charcoal rounded-[32px] font-bold hover:bg-clay transition-all border border-white shadow-sm gap-3 group"
          >
            <LogOut size={20} className="text-sage group-hover:scale-110 transition-transform" />
            <span className="uppercase tracking-widest text-xs">Disconnect Journey</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string, value: string, sub?: string }) {
  return (
    <div className="bg-sand/40 p-4 rounded-3xl border border-white">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 leading-tight">{label}</p>
      <p className="text-xl font-bold text-charcoal">
        {value}<span className="text-[10px] text-sage font-black ml-0.5">{sub}</span>
      </p>
    </div>
  );
}

function ProfileItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <motion.button 
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center justify-between p-5 bg-white border border-sand rounded-[32px] group hover:border-sage/30 transition-all shadow-sm shadow-parchment"
    >
      <div className="flex items-center gap-4">
        <div className="text-gray-300 group-hover:text-sage transition-colors">
          {icon}
        </div>
        <span className="font-bold text-charcoal/80 text-sm tracking-tight">{label}</span>
      </div>
      <div className="text-sand group-hover:text-sage/30">
        <ChevronRight size={18} />
      </div>
    </motion.button>
  );
}
