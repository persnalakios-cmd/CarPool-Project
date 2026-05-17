import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, addDoc, updateDoc, doc, serverTimestamp, getDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { GoogleMapsProvider, LiveMap, useGooglePlacesAutocomplete, Directions, InfoWindow, RouteInfo } from "../lib/google-maps";
import { AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { Car, Clock, Users, Navigation2, ArrowRight, User as UserIcon, Search, List, Map as MapIcon, Zap, X, MapPin, Phone, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { User } from "firebase/auth";

interface BasePost {
  postId: string;
  startLocation: { lat: number; lng: number; address: string };
  endLocation: { lat: number; lng: number; address: string };
  availableSeats: number;
  validUntil: any;
  status: string;
  isRoutine?: boolean;
  subscriptionMonths?: number;
  goingTime?: string;
  returnTime?: string;
  activeDays?: string[];
  vehicle?: string;
  createdAt: any;
  availabilityStatus?: string; // New field for display
}

const getAvailabilityStatus = (ride: any) => {
  if (ride.isRoutine) {
    if (ride.goingTime) return `Starts at ${ride.goingTime}`;
    return "Routine Commuter";
  }
  return "Available Now";
};

interface DriverPost extends BasePost {
  driverId: string;
}

interface PassengerRequest extends BasePost {
  passengerId: string;
}

export default function Home({ user, onRequestRide }: { user: User, onRequestRide?: (data: any) => void }) {
  const [viewType, setViewType] = useState<'offers' | 'requests'>('offers');
  const [rides, setRides] = useState<DriverPost[]>([]);
  const [requests, setRequests] = useState<PassengerRequest[]>([]);
  const [selectedRide, setSelectedRide] = useState<DriverPost | PassengerRequest | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 31.5204, lng: 74.3587 }); // Lahore, Pakistan
  const [isMapView, setIsMapView] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [posterData, setPosterData] = useState<any | null>(null);
  const [mapHoveredRide, setMapHoveredRide] = useState<DriverPost | PassengerRequest | null>(null);
  const [mapPosterData, setMapPosterData] = useState<any | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  useEffect(() => {
    setRouteInfo(null);
  }, [selectedRide, mapHoveredRide]);

  useEffect(() => {
    if (mapHoveredRide) {
      const uid = 'driverId' in mapHoveredRide ? mapHoveredRide.driverId : (mapHoveredRide as PassengerRequest).passengerId;
      getDoc(doc(db, "users", uid)).then(snap => {
        if (snap.exists()) setMapPosterData(snap.data());
      });
    } else {
      setMapPosterData(null);
    }
  }, [mapHoveredRide]);

  useEffect(() => {
    if (selectedRide) {
      const uid = 'driverId' in selectedRide ? selectedRide.driverId : (selectedRide as PassengerRequest).passengerId;
      getDoc(doc(db, "users", uid)).then(snap => {
        if (snap.exists()) setPosterData(snap.data());
      });
    } else {
      setPosterData(null);
    }
  }, [selectedRide]);

  const { suggestions, getSuggestions } = useGooglePlacesAutocomplete();

  useEffect(() => {
    const ridesRef = collection(db, "driverPosts");
    const qRides = query(ridesRef, where("status", "==", "Active"), orderBy("createdAt", "desc"));
    
    const unsubRides = onSnapshot(qRides, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          postId: doc.id, 
          ...data,
          availabilityStatus: getAvailabilityStatus(data)
        };
      }) as DriverPost[];
      setRides(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "driverPosts"));

    const reqRef = collection(db, "passengerRequests");
    const qReq = query(reqRef, where("status", "==", "Active"), orderBy("createdAt", "desc"));
    
    const unsubReq = onSnapshot(qReq, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          postId: doc.id, 
          ...data,
          availabilityStatus: getAvailabilityStatus(data)
        };
      }) as PassengerRequest[];
      setRequests(docs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "passengerRequests"));

    return () => { unsubRides(); unsubReq(); };
  }, []);

  const handleMatch = async (post: DriverPost | PassengerRequest) => {
    const isDriverPost = 'driverId' in post;
    const sessionId = `session_${Date.now()}`;
    
    try {
      const payload: any = {
        sessionId,
        driverId: isDriverPost ? (post as DriverPost).driverId : user.uid,
        passengerId: isDriverPost ? user.uid : (post as PassengerRequest).passengerId,
        participantIds: [
          isDriverPost ? (post as DriverPost).driverId : user.uid,
          isDriverPost ? user.uid : (post as PassengerRequest).passengerId
        ],
        postId: isDriverPost ? post.postId : null,
        requestId: isDriverPost ? null : post.postId,
        status: "EnRoute",
        updatedAt: serverTimestamp(),
      };

      if (post.isRoutine) {
        payload.isRoutine = true;
        payload.goingTime = post.goingTime;
        payload.returnTime = post.returnTime;
        payload.activeDays = post.activeDays;
        payload.subscriptionMonths = post.subscriptionMonths;
      }

      await addDoc(collection(db, "trackingSessions"), payload);

      const col = isDriverPost ? "driverPosts" : "passengerRequests";
      await updateDoc(doc(db, col, post.postId), { status: "Matched" });
      
      setSelectedRide(null);
    } catch (err) {
       console.error(err);
    }
  };

  const handleSuggestionSelect = (suggestion: any) => {
    setSearchQuery(suggestion.description);
    setMapCenter({ lat: suggestion.lat, lng: suggestion.lng });
    getSuggestions(""); // Clear suggestions
  };

  const activeItems = (viewType === 'offers' ? rides : requests).filter(item => 
    item.startLocation.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.endLocation.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* View Switcher & Search */}
      <div className="px-6 py-4 flex flex-col bg-white border-b border-sand gap-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <input 
              type="text" 
              placeholder="Search destination..." 
              className="w-full bg-sand py-3 px-10 rounded-2xl text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-sage/20 border border-transparent focus:border-clay transition-all"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                getSuggestions(e.target.value);
              }}
            />
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-clay" />
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(""); getSuggestions(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-clay hover:text-sage"
              >
                <X size={14} />
              </button>
            )}

            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-clay rounded-2xl shadow-2xl mt-2 max-h-60 overflow-y-auto">
                {suggestions.map((s, idx) => (
                  <button 
                    key={idx}
                    onClick={() => handleSuggestionSelect(s)}
                    className="w-full text-left p-4 hover:bg-sand text-xs font-bold text-charcoal border-b border-parchment last:border-0 flex items-center gap-3"
                  >
                    <MapPin size={14} className="text-sage shrink-0" />
                    <span className="truncate">{s.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsMapView(!isMapView)}
            className="w-12 h-12 rounded-2xl bg-sand flex items-center justify-center text-sage border border-white shrink-0 hover:border-clay transition-colors"
          >
            {isMapView ? <List size={20} /> : <MapIcon size={20} />}
          </button>
        </div>

        <div className="bg-sand p-1 rounded-2xl flex gap-1">
          <button 
            onClick={() => setViewType('offers')}
            className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${viewType === 'offers' ? 'bg-white shadow-sm text-sage border border-parchment' : 'text-gray-400'}`}
          >
            <Car size={14} /> Drivers
          </button>
          <button 
            onClick={() => setViewType('requests')}
            className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${viewType === 'requests' ? 'bg-white shadow-sm text-sage border border-parchment' : 'text-gray-400'}`}
          >
            <UserIcon size={14} /> Requests
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {isMapView ? (
          <div className="h-full relative">
            <LiveMap center={mapCenter} zoom={11}>
              {activeItems.map(item => (
                <AdvancedMarker 
                  key={item.postId} 
                  position={item.startLocation}
                  onClick={() => {
                    setSelectedRide(item);
                    setMapHoveredRide(item);
                  }}
                  onMouseEnter={() => setMapHoveredRide(item)}
                >
                  <div className="relative group/pin">
                    <div className="bg-sage text-white p-2.5 rounded-full shadow-lg border-2 border-white ring-4 ring-sage/10 transition-transform active:scale-95 group-hover:scale-110">
                      {viewType === 'offers' ? <Car size={18} /> : <UserIcon size={18} />}
                    </div>
                    {viewType === 'offers' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#4CAF50] border-2 border-white rounded-full shadow-sm" />
                    )}
                  </div>
                </AdvancedMarker>
              ))}

              {mapHoveredRide && (
                <InfoWindow
                  position={mapHoveredRide.startLocation}
                  onCloseClick={() => setMapHoveredRide(null)}
                >
                  <div className="p-2 min-w-[180px]">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-sand flex items-center justify-center overflow-hidden border border-parchment">
                        {mapPosterData?.photoURL ? (
                          <img src={mapPosterData.photoURL} className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon size={20} className="text-sage" />
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-charcoal truncate">{mapPosterData?.name || 'User'}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500 text-[10px]">★</span>
                          <span className="text-[8px] font-bold text-gray-400">4.9 (24)</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-1 mb-3">
                      <p className="text-[7px] text-gray-400 uppercase font-bold tracking-widest">Availability</p>
                      <p className="text-[9px] font-bold text-[#4CAF50]">{mapHoveredRide.availabilityStatus}</p>
                    </div>

                    <div className="space-y-1 mb-3">
                      <p className="text-[7px] text-gray-400 uppercase font-bold tracking-widest">Destination</p>
                      <p className="text-[9px] font-bold text-charcoal truncate">{mapHoveredRide.endLocation.address}</p>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestRide?.({
                          startLocation: mapHoveredRide.startLocation,
                          endLocation: mapHoveredRide.endLocation,
                          postType: 'passenger'
                        });
                      }}
                      className="w-full bg-[#4CAF50] text-white py-2 rounded-xl text-[8px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm hover:bg-[#43a047] transition-colors"
                    >
                      <Zap size={10} /> Request Ride
                    </button>
                  </div>
                </InfoWindow>
              )}

              {(mapHoveredRide || selectedRide) && (
                <Directions 
                  origin={(mapHoveredRide || selectedRide)!.startLocation} 
                  destination={(mapHoveredRide || selectedRide)!.endLocation} 
                  color={"#EF4444"}
                  onRouteInfo={setRouteInfo}
                />
              )}

              {routeInfo && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute bottom-6 left-6 right-6 bg-white/95 backdrop-blur-md p-4 rounded-[32px] shadow-2xl border border-white flex justify-around items-center z-10"
                >
                  <div className="text-center">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Distance</p>
                    <p className="text-[11px] font-bold text-charcoal">{(routeInfo.distance / 1000).toFixed(1)} km</p>
                  </div>
                  <div className="w-px h-6 bg-sand" />
                  <div className="text-center">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Duration</p>
                    <p className="text-[11px] font-bold text-charcoal">{Math.round(routeInfo.time / 60)} min</p>
                  </div>
                  <div className="w-px h-6 bg-sand" />
                  <div className="text-center">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Price Est.</p>
                    <p className="text-[11px] font-bold text-[#4CAF50]">Rs. {Math.round((routeInfo.distance / 1000) * 45)}</p>
                  </div>
                </motion.div>
              )}
            </LiveMap>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {activeItems.length === 0 ? (
              <div className="text-center py-20 bg-parchment/30 rounded-[40px] border-2 border-dashed border-clay">
                <Zap size={32} className="text-clay mx-auto mb-4 animate-pulse" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">Scoping {viewType}...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Fuel Saver Reward Card (Adsterra Placement) */}
                <motion.a
                  href="https://www.effectivecpmnetwork.com/mq1sjd0k?key=53db635ff422da0f3a81bf28bd114ffb"
                  target="_blank"
                  rel="noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="block bg-gradient-to-br from-sage to-[#4CAF50] p-6 rounded-[32px] text-white shadow-xl shadow-sage/20 border border-white/20 relative overflow-hidden"
                >
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap size={16} className="text-sand animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-sand">Exclusive Reward</span>
                    </div>
                    <h3 className="text-lg font-bold leading-tight mb-1">Fuel Saver Tips & Bonus Offers</h3>
                    <p className="text-[11px] font-medium opacity-90 leading-relaxed max-w-[200px]">
                      Save up to 30% on fuel with today's regional partner rewards.
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-white/20 px-3 py-2 rounded-xl w-fit border border-white/10">
                      Check Rewards <ArrowRight size={12} />
                    </div>
                  </div>
                  {/* Abstract shapes for premium feel */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
                  <div className="absolute bottom-0 right-0 w-16 h-16 bg-sand/10 rounded-full mr-4 mb-4" />
                </motion.a>

                {activeItems.map((item) => (
                  <RideCard 
                    key={item.postId} 
                    ride={item} 
                    type={viewType}
                    onClick={() => setSelectedRide(item)} 
                    onHover={(ride) => setMapHoveredRide(ride)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feed Title (Removed from here as it's repetitive) */}

      {/* Ride Detail Panel (BottomSheet-style) */}
      <AnimatePresence>
        {selectedRide && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRide(null)}
              className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[48px] p-8 pb-12 z-[70] shadow-2xl max-w-[375px] mx-auto border-t border-white overflow-y-auto max-h-[90vh] no-scrollbar"
            >
              <div className="w-12 h-1.5 bg-clay rounded-full mx-auto mb-8 cursor-grab" onClick={() => setSelectedRide(null)} />
              
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl bg-clay flex items-center justify-center overflow-hidden border-2 border-sage">
                    {posterData?.photoURL ? (
                      <img src={posterData.photoURL} alt={posterData.name} className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="text-sage w-8 h-8" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-charcoal leading-tight">
                      {posterData?.name || (viewType === 'offers' ? 'Driver' : 'Passenger')}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1 bg-[#4CAF50]/10 px-2 py-0.5 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#4CAF50]" />
                        <p className="text-[9px] text-[#4CAF50] font-bold uppercase tracking-wider">
                          {selectedRide.availabilityStatus}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-sand p-4 rounded-2xl text-sage">
                  {viewType === 'offers' ? <Car size={28} /> : <UserIcon size={28} />}
                </div>
              </div>

              <div className="space-y-6 mb-10 pl-2">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full border-2 border-sage bg-white" />
                    <div className="w-0.5 h-full bg-sand my-1" />
                    <div className="w-2.5 h-2.5 rounded-full bg-sage" />
                  </div>
                  <div className="flex-1 space-y-6">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">Departure</p>
                      <p className="text-sm font-bold text-charcoal leading-snug">{selectedRide.startLocation.address}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">Arrival</p>
                      <p className="text-sm font-bold text-charcoal leading-snug">{selectedRide.endLocation.address}</p>
                    </div>
                  </div>
                </div>

                <div className="h-40 rounded-[32px] overflow-hidden border-2 border-parchment relative">
                   <LiveMap center={selectedRide.startLocation} zoom={12}>
                      <AdvancedMarker position={selectedRide.startLocation}><Pin background="#E8E6DB" /></AdvancedMarker>
                      <AdvancedMarker position={selectedRide.endLocation}><Pin background="#5A6B5D" glyphColor="#fff" /></AdvancedMarker>
                      <Directions 
                        origin={selectedRide.startLocation} 
                        destination={selectedRide.endLocation} 
                        color="#EF4444" 
                        onRouteInfo={setRouteInfo}
                      />
                   </LiveMap>
                   <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-sand">
                      <p className="text-[8px] font-bold text-sage uppercase tracking-widest">Route Analysis</p>
                      {routeInfo ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] font-bold text-charcoal">{(routeInfo.distance/1000).toFixed(1)}km</p>
                          <span className="text-clay text-[10px] opacity-30">•</span>
                          <p className="text-[10px] font-bold text-charcoal">{Math.round(routeInfo.time/60)}min</p>
                        </div>
                      ) : (
                        <p className="text-[10px] font-bold text-charcoal">Tracking path...</p>
                      )}
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-sand/50 p-5 rounded-3xl border border-white">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 leading-tight">
                    {selectedRide.isRoutine ? "Subscription" : "Window"}
                  </p>
                  <p className="font-bold text-charcoal flex items-center gap-2">
                    <Clock size={16} className="text-sage" />
                    {selectedRide.isRoutine 
                      ? `${selectedRide.subscriptionMonths} Month${selectedRide.subscriptionMonths! > 1 ? 's' : ''}`
                      : `Until ${new Date(selectedRide.validUntil.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    }
                  </p>
                </div>
                <div className="bg-sand/50 p-5 rounded-3xl border border-white">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Capacity</p>
                  <p className="font-bold text-charcoal flex items-center gap-2">
                    <Users size={16} className="text-sage" />
                    {selectedRide.availableSeats} Passengers
                  </p>
                </div>
              </div>

              {selectedRide.isRoutine && (
                <div className="mb-10 space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                      <div 
                        key={day}
                        className={`text-[8px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${selectedRide.activeDays?.includes(day) ? 'bg-sage text-white' : 'bg-sand text-gray-300'}`}
                      >
                        {day.substring(0, 3)}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-charcoal bg-parchment p-4 rounded-2xl border border-sand">
                    <div className="flex items-center gap-2 text-sage">
                      <Zap size={14} /> Commute Times
                    </div>
                    <div>
                      {selectedRide.goingTime} - {selectedRide.returnTime}
                    </div>
                  </div>
                </div>
              )}

              {selectedRide && ('driverId' in selectedRide ? selectedRide.driverId : (selectedRide as PassengerRequest).passengerId) !== user.uid ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    {posterData?.phone && (
                      <a 
                        href={`tel:${posterData.phone}`}
                        className="flex-1 bg-white border border-sand text-charcoal rounded-[24px] py-4 font-bold shadow-sm hover:bg-sand transition-all flex items-center justify-center gap-2"
                      >
                        <Phone size={18} className="text-sage" /> Call
                      </a>
                    )}
                    {posterData?.whatsapp && (
                      <a 
                        href={`https://wa.me/${posterData.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-[#25D366] text-white rounded-[24px] py-4 font-bold shadow-lg shadow-[#25D366]/20 hover:bg-[#1ebe57] transition-all flex items-center justify-center gap-2"
                      >
                        <MessageCircle size={18} /> WhatsApp
                      </a>
                    )}
                  </div>

                  <button 
                    onClick={() => handleMatch(selectedRide)}
                    className="w-full bg-sage text-white rounded-[24px] py-4 font-bold shadow-xl shadow-sage/20 hover:bg-sage/90 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    {viewType === 'offers' ? 'Join Journey' : 'Accept Request'}
                    <ArrowRight size={20} />
                  </button>

                  {'driverId' in selectedRide && (
                    <button 
                      onClick={() => onRequestRide?.({
                        startLocation: selectedRide.startLocation,
                        endLocation: selectedRide.endLocation,
                        postType: 'passenger'
                      })}
                      className="w-full bg-sand text-sage border border-parchment rounded-[24px] py-4 font-bold shadow-sm hover:bg-clay/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                       Request Ride
                       <Search size={18} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] bg-sand py-4 rounded-2xl">
                  Your own post
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const RideCard: React.FC<{ 
  ride: DriverPost | PassengerRequest; 
  onClick: () => void; 
  onHover: (ride: DriverPost | PassengerRequest | null) => void;
  type: 'offers' | 'requests' 
}> = ({ ride, onClick, onHover, type }) => {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white border border-sand rounded-[32px] p-6 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden group"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-sand w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-white group-hover:bg-sage/10 transition-colors">
            {type === 'offers' ? <Car className="text-sage w-6 h-6" /> : <UserIcon className="text-sage w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-charcoal truncate">
                {type === 'offers' ? 'Member' : 'Commuter'}
              </p>
              {ride.isRoutine && (
                <span className="text-[8px] font-bold bg-sage text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Routine</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[8px] font-bold text-[#4CAF50] uppercase tracking-wider">{ride.availabilityStatus}</span>
              <span className="text-gray-300 text-[8px]">•</span>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.2em]">{ride.vehicle || 'Verified Journey'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sage bg-sand px-3 py-1.5 rounded-xl border border-white font-bold text-xs">
          <Users size={14} />
          {ride.availableSeats}
        </div>
      </div>

      <div className="space-y-3 pl-1 mb-6 border-l-2 border-parchment">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full border border-sage/50" />
          <p className="text-xs text-gray-500 truncate font-medium">{ride.startLocation.address}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-sage" />
          <p className="text-xs text-charcoal font-bold truncate leading-relaxed">{ride.endLocation.address}</p>
        </div>
      </div>

        <div className="flex items-center justify-between border-t border-sand pt-4">
        <div className="flex items-center gap-2 text-gray-400">
          <Clock size={12} className="text-sage" />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {ride.isRoutine 
              ? `${ride.goingTime} • Commute`
              : new Date(ride.validUntil.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          </span>
        </div>
        {ride.availableSeats > 0 ? (
          <motion.div 
            whileHover={{ scale: 1.05 }}
            onMouseEnter={() => onHover(ride)}
            onMouseLeave={() => onHover(null)}
            title="Connect to Ride"
            className="bg-[#4CAF50] text-white text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-2 rounded-xl flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm cursor-pointer"
          >
            Connect <ArrowRight size={14} />
          </motion.div>
        ) : (
          <div className="text-red-400 text-[8px] font-bold uppercase tracking-widest bg-red-50 px-2 py-1 rounded-lg">
            Offer not available
          </div>
        )}
      </div>
    </motion.div>
  );
}
