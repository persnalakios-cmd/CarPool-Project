import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary, InfoWindow } from '@vis.gl/react-google-maps';
export { InfoWindow };
import { useState, useEffect, ReactNode, useRef } from 'react';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  if (!hasValidKey) {
    return (
      <div className="flex items-center justify-center h-full p-6 bg-slate-50 font-sans">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Google Maps API Key Required</h2>
          <p className="text-slate-600 mb-4 text-sm leading-relaxed">
            Please add your <strong>GOOGLE_MAPS_PLATFORM_KEY</strong> to the Secrets panel to enable map features.
          </p>
          <div className="text-left bg-white p-4 rounded-2xl border border-slate-200 text-xs text-slate-500 flex flex-col gap-2">
            <p>1. Open <strong>Settings</strong> (⚙️) top-right.</p>
            <p>2. Select <strong>Secrets</strong>.</p>
            <p>3. Name: <code>GOOGLE_MAPS_PLATFORM_KEY</code></p>
            <p>4. Value: Paste your key and press Enter.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      {children}
    </APIProvider>
  );
}

export function LiveMap({ 
  center, 
  zoom = 13, 
  onMapClick,
  children 
}: { 
  center: { lat: number, lng: number }, 
  zoom?: number, 
  onMapClick?: (e: google.maps.MapMouseEvent) => void,
  children?: ReactNode 
}) {
  return (
    <div className="w-full h-full rounded-3xl overflow-hidden shadow-inner border border-slate-100">
      <Map
        defaultCenter={center}
        defaultZoom={zoom}
        mapId="CARPOOL_MAP_ID"
        onClick={onMapClick}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
        gestureHandling={'greedy'}
        disableDefaultUI={true}
      >
        {children}
      </Map>
    </div>
  );
}

export interface RouteInfo {
  distance: number; // in meters
  time: number;    // in seconds
}

export function Directions({ 
  origin, 
  destination,
  color = "#EF4444",
  onRouteInfo
}: { 
  origin: { lat: number, lng: number }, 
  destination: { lat: number, lng: number },
  color?: string,
  onRouteInfo?: (info: RouteInfo) => void
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map || !origin || !destination) return;

    // Clear previous route
    polylinesRef.current.forEach(p => p.setMap(null));

    const fetchRoute = async () => {
      try {
        const response = await fetch(`/api/directions?fromLat=${origin.lat}&fromLng=${origin.lng}&toLat=${destination.lat}&toLng=${destination.lng}`);
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          const newPolylines: google.maps.Polyline[] = [];

          // Capture meta from primary route (index 0)
          if (onRouteInfo && data.features[0].properties) {
            onRouteInfo({
              distance: data.features[0].properties.distance,
              time: data.features[0].properties.time
            });
          }

          data.features.forEach((feature: any, index: number) => {
            if (!feature.geometry) return;
            
            const geometry = feature.geometry;
            let coords = [];
            
            if (geometry.type === 'LineString') {
              coords = geometry.coordinates.map((coord: [number, number]) => ({
                lat: coord[1],
                lng: coord[0]
              }));
            } else if (geometry.type === 'MultiLineString') {
              coords = geometry.coordinates.flat().map((coord: [number, number]) => ({
                lat: coord[1],
                lng: coord[0]
              }));
            }

            if (coords.length > 0) {
              const polyline = new google.maps.Polyline({
                path: coords,
                strokeColor: index === 0 ? color : "#3B82F6", // Primary red, Alternative blue
                strokeWeight: index === 0 ? 6 : 4,           // Main route slightly thicker
                strokeOpacity: index === 0 ? 0.9 : 0.7,      // Alternative slightly transparent
                zIndex: index === 0 ? 100 : 90,              // Main on top
                map: map
              });
              newPolylines.push(polyline);
            }
          });

          polylinesRef.current = newPolylines;
        }
      } catch (err) {
        console.error("Geoapify Routing Error:", err);
      }
    };

    fetchRoute();

    return () => polylinesRef.current.forEach(p => p.setMap(null));
  }, [map, origin.lat, origin.lng, destination.lat, destination.lng, color]);

  return null;
}

export function useForwardGeocode() {
  const geocodingLib = useMapsLibrary('geocoding');
  
  const geocode = async (address: string) => {
    if (!geocodingLib) return null;
    const geocoder = new geocodingLib.Geocoder();
    try {
      const result = await geocoder.geocode({ address });
      if (result.results[0]) {
        return {
          lat: result.results[0].geometry.location.lat(),
          lng: result.results[0].geometry.location.lng(),
          address: result.results[0].formatted_address
        };
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  return geocode;
}

export function useReverseGeocode() {
  const mapsLib = useMapsLibrary('maps');
  const geocodingLib = useMapsLibrary('geocoding');

  const reverseGeocode = async (lat: number, lng: number) => {
    if (!geocodingLib && !mapsLib) return null;
    const GeocoderClass = geocodingLib?.Geocoder || (typeof google !== 'undefined' ? google.maps.Geocoder : null);
    if (!GeocoderClass) return null;
    
    const geocoder = new GeocoderClass();
    try {
      const response = await geocoder.geocode({ location: { lat, lng } });
      return response.results[0]?.formatted_address || "Unknown Location";
    } catch (e) {
      console.error(e);
      return "Selected Location";
    }
  };

  return reverseGeocode;
}

export function useGooglePlacesAutocomplete() {
  const placesLib = useMapsLibrary('places');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (placesLib && !sessionToken) {
      setSessionToken(new placesLib.AutocompleteSessionToken());
    }
  }, [placesLib, sessionToken]);

  const getSuggestions = async (input: string) => {
    if (!placesLib || !input || !sessionToken) {
      setSuggestions([]);
      return;
    }

    try {
      const { suggestions: predictions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken,
        region: 'pk', // Default to Pakistan
      });

      const results = await Promise.all((predictions || []).map(async (s) => {
        const place = s.placePrediction?.toPlace();
        if (!place) return { description: s.placePrediction?.text.toString() || "", lat: 0, lng: 0 };
        
        await place.fetchFields({ fields: ['location', 'displayName'] });
        
        return {
          description: s.placePrediction?.text.toString() || "",
          lat: place.location?.lat() || 0,
          lng: place.location?.lng() || 0
        };
      }));
      setSuggestions(results);
    } catch (e: any) {
      console.error("Autocomplete Error:", e);
      if (e.code === 'PERMISSIONS_DENIED' || (e.message && e.message.includes('not allowed'))) {
        console.warn("Places API (New) might not be enabled or API key restricted.");
      }
      setSuggestions([]);
    }
  };

  return { suggestions, getSuggestions };
}
