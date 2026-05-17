import React, { useState, useEffect, useRef } from "react";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { GoogleMapsProvider, LiveMap, Directions } from "../lib/google-maps";
import { AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, orderBy, limit } from "firebase/firestore";
import { Navigation, MapPin, Phone, MessageSquare, CheckCircle2, ChevronRight, Car, Star, Send, History as HistoryIcon, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Session {
  sessionId: string;
  driverId: string;
  passengerId: string;
  currentDriverLocation?: { lat: number, lng: number };
  startLocation?: { lat: number, lng: number };
  endLocation?: { lat: number, lng: number };
  vehicle?: string;
  status: string;
  isRoutine?: boolean;
  goingTime?: string;
  returnTime?: string;
  activeDays?: string[];
  updatedAt: any;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  createdAt: any;
}

export default function Activity() {
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);

  const checkCommuteActive = (session: Session) => {
    if (!session.isRoutine || !session.goingTime || !session.returnTime || !session.activeDays) {
      return { active: true, reason: 'One-time journey' };
    }

    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];

    if (!session.activeDays.includes(currentDay)) {
      return { active: false, reason: `Inactive on ${currentDay}` };
    }

    const checkTime = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const scheduled = new Date();
      scheduled.setHours(hours, minutes, 0, 0);
      
      const diff = (scheduled.getTime() - now.getTime()) / (1000 * 60);
      return diff <= 15 && diff >= -120; // Active 15 mins before and up to 2 hours after
    };

    const goingActive = checkTime(session.goingTime);
    const returnActive = checkTime(session.returnTime);

    if (goingActive) return { active: true, reason: 'Morning Commute Active' };
    if (returnActive) return { active: true, reason: 'Evening Commute Active' };

    return { active: false, reason: 'Scheduled for later' };
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    // Active Sessions
    const qLive = query(
      collection(db, "trackingSessions"), 
      where("participantIds", "array-contains", auth.currentUser.uid),
      where("status", "in", ["EnRoute", "Arrived"])
    );

    const unsubLive = onSnapshot(qLive, (snap) => {
      const data = snap.docs
        .map(doc => ({ sessionId: doc.id, ...doc.data() })) as Session[];
      setSessions(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "trackingSessions"));

    // History Sessions
    const qHistory = query(
      collection(db, "trackingSessions"), 
      where("participantIds", "array-contains", auth.currentUser.uid),
      where("status", "==", "Completed"),
      limit(20)
    );

    const unsubHistory = onSnapshot(qHistory, (snap) => {
      const data = snap.docs
        .map(doc => ({ sessionId: doc.id, ...doc.data() })) as Session[];
      setHistory(data);
    });

    return () => {
      unsubLive();
      unsubHistory();
    };
  }, []);

  const completeSession = async () => {
    if (!activeSession) return;
    try {
      await updateDoc(doc(db, "trackingSessions", activeSession.sessionId), {
        status: "Completed",
        updatedAt: serverTimestamp()
      });
      setShowRating(true);
    } catch (e) {
      console.error(e);
    }
  };

  const submitRating = async () => {
    if (!activeSession) return;
    try {
      await addDoc(collection(db, "reviews"), {
        reviewerId: auth.currentUser?.uid,
        targetUserId: activeSession.driverId === auth.currentUser?.uid ? activeSession.passengerId : activeSession.driverId,
        rating,
        sessionId: activeSession.sessionId,
        createdAt: serverTimestamp()
      });
      setShowRating(false);
      setActiveSession(null);
      setRating(0);
    } catch (e) {
      console.error(e);
    }
  };

  if (activeSession) {
    return (
      <div className="flex flex-col h-full bg-parchment relative overflow-hidden">
        <div className="flex-1">
          <LiveMap center={activeSession.currentDriverLocation || activeSession.startLocation || { lat: 31.5204, lng: 74.3587 }}>
            {activeSession.currentDriverLocation && (
              <AdvancedMarker position={activeSession.currentDriverLocation}>
                <div className="bg-sage p-2 rounded-full border-2 border-white shadow-lg">
                  <Car className="text-white" size={16} />
                </div>
              </AdvancedMarker>
            )}
            {activeSession.startLocation && activeSession.endLocation && (
              <Directions 
                origin={activeSession.startLocation} 
                destination={activeSession.endLocation} 
                color="#EF4444"
              />
            )}
          </LiveMap>
        </div>

        <button 
          onClick={() => { setActiveSession(null); setShowChat(false); }}
          className="absolute top-4 left-4 bg-white/90 backdrop-blur p-2 rounded-xl shadow-lg border border-white/50 z-50 text-sage"
        >
          <ChevronRight className="rotate-180" size={20} />
        </button>

        {/* Chat Drawer Overlay */}
        <AnimatePresence>
          {showChat && (
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="absolute inset-0 bg-white z-[60] flex flex-col"
            >
              <div className="p-6 border-b border-sand flex items-center gap-4">
                <button onClick={() => setShowChat(false)} className="text-sage"><ChevronRight className="rotate-180" /></button>
                <h3 className="font-bold text-charcoal">Ride Chat</h3>
              </div>
              <Chat session={activeSession} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rating Modal */}
        <AnimatePresence>
          {showRating && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-[100] flex items-center justify-center p-8"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white rounded-[48px] p-10 w-full max-w-sm text-center shadow-2xl"
              >
                <div className="w-20 h-20 bg-sand rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <Star className="text-sage" size={40} />
                </div>
                <h3 className="text-2xl font-bold text-charcoal mb-2">Ride Completed</h3>
                <p className="text-slate-400 text-sm mb-8">How was your journey with your companion?</p>
                <div className="flex justify-center gap-2 mb-10">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} onClick={() => setRating(s)} className="text-sage">
                      <Star size={32} fill={rating >= s ? "currentColor" : "none"} strokeWidth={2} />
                    </button>
                  ))}
                </div>
                <button 
                  onClick={submitRating}
                  className="w-full bg-sage text-white py-4 rounded-2xl font-bold shadow-xl shadow-sage/20"
                >
                  Submit & Close
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-0 left-0 right-0 p-8 bg-white rounded-t-[48px] shadow-2xl border-t border-white z-50">
          <div className="w-12 h-1.5 bg-sand rounded-full mx-auto mb-8" />
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-sand rounded-2xl flex items-center justify-center border-2 border-white">
                <Navigation className="text-sage" size={24} />
              </div>
              <div>
                <p className="text-lg font-bold text-charcoal">{activeSession.status === 'Arrived' ? 'At Destination' : 'En Route'}</p>
                <p className="text-[10px] text-sage font-bold uppercase tracking-[0.2em]">GPS Active • 2 min away</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowChat(true)}
                className="w-10 h-10 bg-sand rounded-xl flex items-center justify-center text-sage border border-white"
              >
                <MessageSquare size={18} />
              </button>
              <button className="w-10 h-10 bg-sand rounded-xl flex items-center justify-center text-sage border border-white">
                <Phone size={18} />
              </button>
            </div>
          </div>

          <button 
            className="w-full bg-sage text-white rounded-2xl py-4 font-bold shadow-xl shadow-sage/20 flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
            onClick={completeSession}
          >
            {activeSession.driverId === auth.currentUser?.uid ? 'Mark as Completed' : 'Confirm Safe Arrival'}
            <CheckCircle2 size={18} />
          </button>
        </div>
      </div>
    );
  }

  const listItems = activeTab === 'live' ? sessions : history;

  return (
    <div className="p-8 h-full bg-white overflow-y-auto no-scrollbar">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-3xl font-bold text-charcoal">Activity</h2>
        <div className="bg-sand p-1 rounded-2xl flex gap-1">
          <button 
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${activeTab === 'live' ? 'bg-white shadow-sm text-sage' : 'text-gray-400'}`}
          >
            Live
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-sage' : 'text-gray-400'}`}
          >
            History
          </button>
        </div>
      </div>
      <p className="text-slate-400 text-sm font-medium mb-10 italic">
        {activeTab === 'live' ? "Active journeys and connections." : "Your past shared travels."}
      </p>

      {listItems.length === 0 ? (
        <div className="bg-parchment rounded-[48px] p-12 text-center border-2 border-dashed border-clay shadow-sm mt-10">
          <div className="bg-white w-20 h-20 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-sm">
            {activeTab === 'live' ? <Navigation size={32} className="text-clay" /> : <HistoryIcon size={32} className="text-clay" />}
          </div>
          <h3 className="font-bold text-charcoal mb-2 text-lg">No {activeTab} activity</h3>
          <p className="text-slate-400 text-xs leading-relaxed max-w-[220px] mx-auto font-medium">
            Shared experiences appear here once you match with a companion.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {listItems.map(session => {
            const commuteStatus = checkCommuteActive(session);
            const isClickable = activeTab === 'live' && commuteStatus.active;

            return (
              <div 
                key={session.sessionId}
                onClick={() => isClickable && setActiveSession(session)}
                className={`bg-white p-6 rounded-[32px] border border-sand shadow-sm flex items-center justify-between group transition-all hover:shadow-md ${isClickable ? 'cursor-pointer hover:border-sage' : 'opacity-60 grayscale-[0.5]'}`}
              >
                <div className="flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-white ${commuteStatus.active ? 'bg-sand' : 'bg-parchment'}`}>
                    {activeTab === 'live' ? (
                      <Zap className={commuteStatus.active ? "text-sage" : "text-clay"} size={28} />
                    ) : (
                      <HistoryIcon className="text-clay" size={28} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                       <p className="text-sm font-bold text-charcoal">Ride #{session.sessionId.slice(-4)}</p>
                       {session.isRoutine && (
                         <span className="text-[8px] font-bold bg-sage/10 text-sage px-2 py-0.5 rounded-full border border-sage/20 uppercase tracking-widest">Routine</span>
                       )}
                    </div>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${commuteStatus.active ? 'text-sage' : 'text-clay'}`}>
                      {commuteStatus.reason}
                    </p>
                  </div>
                </div>
                {isClickable && <ChevronRight className="text-clay group-hover:text-sage transition-colors" size={24} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chat({ session }: { session: Session }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, "trackingSessions", session.sessionId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[]);
    });
    return unsub;
  }, [session.sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !auth.currentUser) return;
    try {
      await addDoc(collection(db, "trackingSessions", session.sessionId, "messages"), {
        text,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || "User",
        createdAt: serverTimestamp()
      });
      setText("");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-sand/20">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(m => (
          <div 
            key={m.id} 
            className={`flex flex-col ${m.senderId === auth.currentUser?.uid ? 'items-end' : 'items-start'}`}
          >
            {m.senderId !== auth.currentUser?.uid && (
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 ml-2">
                {m.senderName || 'Companion'}
              </span>
            )}
            <div className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium shadow-sm transition-all ${m.senderId === auth.currentUser?.uid ? 'bg-sage text-white rounded-tr-none' : 'bg-white text-charcoal rounded-tl-none border border-sand'}`}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={send} className="p-6 bg-white border-t border-sand flex gap-3">
        <input 
          type="text" 
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type message..." 
          className="flex-1 bg-sand p-4 rounded-2xl text-sm font-medium focus:outline-none"
        />
        <button className="bg-sage text-white p-4 rounded-2xl shadow-lg shadow-sage/20"><Send size={20} /></button>
      </form>
    </div>
  );
}


function ActivityIcon({ size, className }: { size?: number, className?: string }) {
  return <Navigation size={size} className={className} />;
}
