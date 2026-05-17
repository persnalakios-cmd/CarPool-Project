import { useState, useEffect } from "react";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { GoogleMapsProvider, LiveMap, useForwardGeocode, useGooglePlacesAutocomplete, useReverseGeocode, Directions, RouteInfo } from "../lib/google-maps";
import { AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { MapPin, ArrowRight, Save, Clock, Navigation, Maximize2, X, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { User } from "firebase/auth";

export default function Post({ onPostCreated, user, prefillData, onCancelPrefill }: { 
  onPostCreated: () => void, 
  user: User,
  prefillData?: any | null,
  onCancelPrefill?: () => void
}) {
  const [postType, setPostType] = useState<'driver' | 'passenger'>('driver');
  const [step, setStep] = useState(1);
  const [startLoc, setStartLoc] = useState<{ lat: number, lng: number, address: string } | null>(null);
  const [endLoc, setEndLoc] = useState<{ lat: number, lng: number, address: string } | null>(null);
  
  useEffect(() => {
    if (prefillData) {
      if (prefillData.postType) setPostType(prefillData.postType);
      if (prefillData.startLocation) {
        setStartLoc(prefillData.startLocation);
        setStartQuery(prefillData.startLocation.address);
      }
      if (prefillData.endLocation) {
        setEndLoc(prefillData.endLocation);
        setEndQuery(prefillData.endLocation.address);
      }
      // If we have both locations, go to step 3
      if (prefillData.startLocation && prefillData.endLocation) {
        setStep(3);
      }
    }
  }, [prefillData]);
  const [seats, setSeats] = useState(3);
  const [duration, setDuration] = useState(2); // hours
  const [isRoutine, setIsRoutine] = useState(false);
  const [subMonths, setSubMonths] = useState(1);
  const [goingTime, setGoingTime] = useState("09:00");
  const [returnTime, setReturnTime] = useState("17:00");
  const [activeDays, setActiveDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [vehicle, setVehicle] = useState("Bike");
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  
  const { suggestions: startSuggestions, getSuggestions: getStartSuggestions } = useGooglePlacesAutocomplete();
  const { suggestions: endSuggestions, getSuggestions: getEndSuggestions } = useGooglePlacesAutocomplete();
  const geocode = useForwardGeocode();
  const reverseGeocode = useReverseGeocode();

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const toggleDay = (day: string) => {
    setActiveDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSuggestionSelect = (suggestion: any, type: 'start' | 'end') => {
    const pos = { lat: suggestion.lat, lng: suggestion.lng, address: suggestion.description };
    if (type === 'start') {
      setStartLoc(pos);
      setStartQuery(suggestion.description);
      getStartSuggestions("");
    } else {
      setEndLoc(pos);
      setEndQuery(suggestion.description);
      getEndSuggestions("");
    }
  };

  const handleMapClick = async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const address = await reverseGeocode(lat, lng) || "Selected Location";
    const pos = { lat, lng, address };
    if (step === 1) {
      setStartLoc(pos);
      setStartQuery(address);
    }
    else if (step === 2) {
      setEndLoc(pos);
      setEndQuery(address);
    }
  };

  const handleCreatePost = async () => {
    if (!startLoc || !endLoc || !auth.currentUser) return;
    
    setLoading(true);
    try {
      const validUntil = new Date();
      if (isRoutine) {
        validUntil.setMonth(validUntil.getMonth() + subMonths);
      } else {
        validUntil.setHours(validUntil.getHours() + duration);
      }

      const collectionName = postType === 'driver' ? "driverPosts" : "passengerRequests";
      const payload: any = {
        [postType === 'driver' ? 'driverId' : 'passengerId']: auth.currentUser.uid,
        startLocation: startLoc,
        endLocation: endLoc,
        validUntil: Timestamp.fromDate(validUntil),
        status: "Active",
        isRoutine,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (postType === 'driver') {
        payload.availableSeats = seats;
        payload.vehicle = vehicle;
      }

      if (isRoutine) {
        payload.subscriptionMonths = subMonths;
        payload.goingTime = goingTime;
        payload.returnTime = returnTime;
        payload.activeDays = activeDays;
      }

      await addDoc(collection(db, collectionName), payload);
      onPostCreated();
    } catch (e) {
      const collectionName = postType === 'driver' ? "driverPosts" : "passengerRequests";
      handleFirestoreError(e, OperationType.CREATE, collectionName);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="p-8">
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-3xl font-bold text-charcoal">Create Ride</h2>
           <div className="bg-sand p-1 rounded-2xl flex gap-1">
             <button 
               onClick={() => setPostType('driver')}
               className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${postType === 'driver' ? 'bg-sage text-white shadow-sm' : 'text-gray-400'}`}
             >
               Offer
             </button>
             <button 
               onClick={() => setPostType('passenger')}
               className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${postType === 'passenger' ? 'bg-sage text-white shadow-sm' : 'text-gray-400'}`}
             >
               Request
             </button>
           </div>
        </div>

        {prefillData && (
          <div className="mb-6 bg-sage/10 p-4 rounded-[24px] border border-sage/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap size={16} className="text-sage" />
              <p className="text-[10px] font-bold text-sage uppercase tracking-wider">Quick Match Active</p>
            </div>
            <button 
              onClick={onCancelPrefill}
              className="text-sage hover:bg-sage/10 p-1 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Routine Toggle */}
        <div className="flex gap-2 mb-8 bg-sand/50 p-1 rounded-2xl w-fit">
          <button 
            onClick={() => setIsRoutine(false)}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${!isRoutine ? 'bg-white shadow-sm text-sage border border-parchment' : 'text-gray-400'}`}
          >
            One-Time
          </button>
          <button 
            onClick={() => setIsRoutine(true)}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${isRoutine ? 'bg-white shadow-sm text-sage border border-parchment' : 'text-gray-400'}`}
          >
            Routine
          </button>
        </div>
        
        <p className="text-slate-400 text-sm font-medium mb-8 italic">
          {postType === 'driver' ? "Help others commute sustainably." : "Find a shared journey today."}
        </p>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`w-10 h-10 rounded-[14px] flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'bg-sage text-white shadow-lg shadow-sage/20 scale-110' : 'bg-sand text-gray-300'}`}>
                {s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 rounded-full ${step > s ? 'bg-sage' : 'bg-sand'}`} />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[420px] flex flex-col pb-20">
          {step === 1 && (
            <div className="flex-1 flex flex-col">
              <h3 className="font-bold text-charcoal mb-4 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-sage bg-white" />
                Start Location
              </h3>
              
              <div className="relative mb-4">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Type address (e.g. Lahore Fort)" 
                    className="flex-1 bg-sand p-4 rounded-2xl text-sm font-medium border border-clay focus:outline-none focus:ring-2 focus:ring-sage/20"
                    value={startQuery}
                    onChange={(e) => {
                      setStartQuery(e.target.value);
                      getStartSuggestions(e.target.value);
                    }}
                  />
                </div>
                {startSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-white border border-clay rounded-2xl shadow-xl mt-2 max-h-48 overflow-y-auto">
                    {startSuggestions.map((s, idx) => (
                      <button 
                        key={idx}
                        onClick={() => handleSuggestionSelect(s, 'start')}
                        className="w-full text-left p-3 hover:bg-sand text-sm font-medium border-b border-parchment last:border-0"
                      >
                        {s.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`transition-all duration-300 mb-4 rounded-[32px] overflow-hidden border-2 border-parchment shadow-inner relative ${isFullscreen ? 'fixed inset-4 z-[100] h-auto' : 'h-64'}`}>
                <LiveMap center={{ lat: 31.5204, lng: 74.3587 }} onMapClick={handleMapClick} zoom={11}>
                  {startLoc && <AdvancedMarker position={startLoc}><Pin background="#5A6B5D" glyphColor="#fff" /></AdvancedMarker>}
                </LiveMap>
                <button 
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="absolute top-3 right-3 bg-white/90 p-2 rounded-xl shadow-lg z-[110]"
                >
                  <Maximize2 size={16} className="text-sage" />
                </button>
                {isFullscreen && step === 1 && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110] w-full px-10">
                    <button 
                      onClick={() => setIsFullscreen(false)}
                      className="w-full bg-sage text-white py-4 rounded-2xl font-bold shadow-2xl flex items-center justify-center gap-2"
                    >
                      Done Selecting <X size={18} />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <MapPin size={12} /> Select starting location on map
              </p>
              <button 
                disabled={!startLoc}
                onClick={() => setStep(2)}
                className="mt-auto w-full bg-sage text-white py-4 rounded-2xl font-bold disabled:opacity-40 flex items-center justify-center gap-2 shadow-xl shadow-sage/20"
              >
                Continue <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex-1 flex flex-col">
              <h3 className="font-bold text-charcoal mb-4 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-sage" />
                Destination Point
              </h3>

              <div className="relative mb-4">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Type destination (e.g. Liberty Market)" 
                    className="flex-1 bg-sand p-4 rounded-2xl text-sm font-medium border border-clay focus:outline-none focus:ring-2 focus:ring-sage/20"
                    value={endQuery}
                    onChange={(e) => {
                      setEndQuery(e.target.value);
                      getEndSuggestions(e.target.value);
                    }}
                  />
                </div>
                {endSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-white border border-clay rounded-2xl shadow-xl mt-2 max-h-48 overflow-y-auto">
                    {endSuggestions.map((s, idx) => (
                      <button 
                        key={idx}
                        onClick={() => handleSuggestionSelect(s, 'end')}
                        className="w-full text-left p-3 hover:bg-sand text-sm font-medium border-b border-parchment last:border-0"
                      >
                        {s.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`transition-all duration-300 mb-4 rounded-[32px] overflow-hidden border-2 border-parchment shadow-inner relative ${isFullscreen ? 'fixed inset-4 z-[100] h-auto' : 'h-64'}`}>
                <LiveMap center={startLoc || { lat: 31.5204, lng: 74.3587 }} onMapClick={handleMapClick} zoom={11}>
                  {startLoc && <AdvancedMarker position={startLoc}><Pin background="#E8E6DB" /></AdvancedMarker>}
                  {endLoc && <AdvancedMarker position={endLoc}><Pin background="#5A6B5D" glyphColor="#fff" /></AdvancedMarker>}
                  {startLoc && endLoc && <Directions origin={startLoc} destination={endLoc} color="#EF4444" />}
                </LiveMap>
                <button 
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="absolute top-3 right-3 bg-white/90 p-2 rounded-xl shadow-lg z-[110]"
                >
                  <Maximize2 size={16} className="text-sage" />
                </button>
                {isFullscreen && step === 2 && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110] w-full px-10">
                    <button 
                      onClick={() => setIsFullscreen(false)}
                      className="w-full bg-sage text-white py-4 rounded-2xl font-bold shadow-2xl flex items-center justify-center gap-2"
                    >
                      Done Selecting <X size={18} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="w-24 bg-sand text-sage py-4 rounded-2xl font-bold hover:bg-clay/50 transition-colors">Back</button>
                <button 
                  disabled={!endLoc}
                  onClick={() => setStep(3)}
                  className="flex-1 bg-sage text-white py-4 rounded-2xl font-bold disabled:opacity-40 flex items-center justify-center gap-2 shadow-xl shadow-sage/20"
                >
                  Continue <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex-1 flex flex-col">
              <h3 className="font-bold text-charcoal mb-4 border-b-2 border-parchment pb-4">
                {isRoutine ? "Routine Commute Details" : "Trip Details"}
              </h3>
              
              <div className="space-y-6">
                {postType === 'driver' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3">Capacity</label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button 
                            key={n}
                            onClick={() => setSeats(n)}
                            className={`w-10 h-10 rounded-xl font-bold transition-all border-2 ${seats === n ? 'bg-sage text-white border-sage shadow-md' : 'bg-sand text-gray-400 border-transparent'}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3">Vehicle Type</label>
                      <select 
                        value={vehicle}
                        onChange={(e) => setVehicle(e.target.value)}
                        className="w-full bg-sand p-3 rounded-xl text-sm font-bold border-2 border-transparent focus:border-sage outline-none"
                      >
                        <option value="Bike">70cc / 125cc Bike</option>
                        <option value="Car">Sedan / Hatchback</option>
                        <option value="Rickshaw">Rickshaw</option>
                      </select>
                    </div>
                  </div>
                )}

                {isRoutine ? (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3">Subscription Duration</label>
                      <div className="flex items-center gap-2">
                        {[1, 3, 6].map(m => (
                          <button 
                            key={m}
                            onClick={() => setSubMonths(m)}
                            className={`flex-1 py-3 rounded-xl font-bold transition-all border-2 ${subMonths === m ? 'bg-sage text-white border-sage' : 'bg-sand text-gray-400 border-transparent'}`}
                          >
                            {m} Month{m > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                          <Clock size={12} /> Morning (Going)
                        </label>
                        <input 
                          type="time" 
                          className="w-full bg-sand p-3 rounded-xl text-sm font-bold border-2 border-transparent focus:border-sage outline-none"
                          value={goingTime}
                          onChange={(e) => setGoingTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3 flex items-center gap-2">
                          <Clock size={12} /> Evening (Return)
                        </label>
                        <input 
                          type="time" 
                          className="w-full bg-sand p-3 rounded-xl text-sm font-bold border-2 border-transparent focus:border-sage outline-none"
                          value={returnTime}
                          onChange={(e) => setReturnTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3">Active Days</label>
                      <div className="flex flex-wrap gap-2">
                        {days.map(day => (
                          <button 
                            key={day}
                            onClick={() => toggleDay(day)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border-2 ${activeDays.includes(day) ? 'bg-sage text-white border-sage' : 'bg-sand text-gray-400 border-transparent'}`}
                          >
                            {day.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] block mb-3">Availability Window</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map(h => (
                        <button 
                          key={h}
                          onClick={() => setDuration(h)}
                          className={`flex-1 py-3 rounded-xl font-bold transition-all border-2 ${duration === h ? 'bg-sage text-white border-sage' : 'bg-sand text-gray-400 border-transparent'}`}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-sand/80 rounded-[24px] p-4 border border-white mt-2">
                  <div className="flex items-start gap-4">
                    <Navigation className="text-sage shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-xs font-bold text-charcoal">Eco-Journey Commitment</p>
                      <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-1">
                        {isRoutine 
                          ? `This routine involves daily commutes for ${subMonths} month(s) on selected days.`
                          : `This ${postType === 'driver' ? 'offering' : 'request'} will be active for the next ${duration} hours.`
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="h-40 rounded-[32px] overflow-hidden border-2 border-parchment mt-4 relative">
                   <LiveMap center={startLoc!} zoom={12}>
                      <AdvancedMarker position={startLoc!}><Pin background="#E8E6DB" /></AdvancedMarker>
                      <AdvancedMarker position={endLoc!}><Pin background="#5A6B5D" glyphColor="#fff" /></AdvancedMarker>
                      <Directions 
                        origin={startLoc!} 
                        destination={endLoc!} 
                        color="#EF4444" 
                        onRouteInfo={setRouteInfo}
                      />
                   </LiveMap>
                   {routeInfo && (
                     <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-sand">
                        <p className="text-[8px] font-bold text-sage uppercase tracking-widest">Calculated Route</p>
                        <p className="text-[10px] font-bold text-charcoal">
                          {(routeInfo.distance/1000).toFixed(1)}km • {Math.round(routeInfo.time/60)}min
                        </p>
                     </div>
                   )}
                </div>
              </div>

              <div className="mt-auto flex gap-3 pt-6">
                <button onClick={() => setStep(2)} className="w-20 bg-sand text-sage py-4 rounded-2xl font-bold italic">Back</button>
                <button 
                  onClick={handleCreatePost}
                  disabled={loading}
                  className="flex-1 bg-sage text-white py-4 rounded-2xl font-bold shadow-xl shadow-sage/20 flex items-center justify-center gap-3"
                >
                  {loading ? 'Publishing...' : `Publish ${postType === 'driver' ? 'Offer' : 'Request'}`} <Save size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
