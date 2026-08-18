// components/students/TransportToggle.jsx
import React, { useState } from 'react';
import { Bus, MapPin } from 'lucide-react';
import { toast } from 'sonner'; // Assuming sonner is installed for toasts

export default function TransportToggle({ studentId, initialOptIn = false, currentRoute = "" }) {
  const [isOptedIn, setIsOptedIn] = useState(initialOptIn);
  const [isLoading, setIsLoading] = useState(false);
  const [route, setRoute] = useState(currentRoute);

  const handleToggle = async () => {
    setIsLoading(true);
    const newStatus = !isOptedIn;
    
    try {
      const response = await fetch(`/api/v1/students/${studentId}/transport-opt-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          opt_in: newStatus, 
          route_id: newStatus ? "ROUTE_A1" : null // Hardcoded for demo; would come from a select input
        }),
      });

      if (!response.ok) throw new Error("Failed to update transport settings");

      setIsOptedIn(newStatus);
      toast.success(`Transport ${newStatus ? 'enabled' : 'disabled'} for student. Fees updated.`);
    } catch (error) {
      toast.error("Error updating transport preferences.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-sm transition-transform hover:-translate-y-[2px]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-md">
            <Bus size={24} weight="duotone" />
          </div>
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">School Transport</h3>
            <p className="text-sm text-slate-500">Enable GPS tracking and automated transport fee billing.</p>
          </div>
        </div>
        
        {/* Simplified custom switch / Use Shadcn UI <Switch /> here if initialized */}
        <button 
          data-testid="opt-transport-toggle"
          onClick={handleToggle}
          disabled={isLoading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
            isOptedIn ? 'bg-blue-600' : 'bg-slate-200'
          }`}
        >
          <span className="sr-only">Toggle Transport</span>
          <span 
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isOptedIn ? 'translate-x-6' : 'translate-x-1'
            }`} 
          />
        </button>
      </div>

      {isOptedIn && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin size={16} className="text-slate-400" />
            <span>Assigned Route: <strong className="text-slate-900">{route || "ROUTE_A1 (North Campus)"}</strong></span>
          </div>
          <button 
            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            data-testid="btn-live-tracking"
          >
            Live Tracking
          </button>
        </div>
      )}
    </div>
  );
}
