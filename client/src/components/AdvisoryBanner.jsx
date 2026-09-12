import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function AdvisoryBanner({ advisory, className = '' }) {
  if (!advisory) return null;

  return (
    <div className={`w-full bg-amber-50 border border-amber-200/90 rounded-xl p-4 sm:p-4.5 shadow-sm transition-all ${className}`}>
      <div className="flex items-start sm:items-center gap-3">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 bg-amber-100/90 text-amber-900 font-bold text-xs rounded uppercase tracking-wide">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
          <span>{advisory.title || 'ACTIVE ADVISORY'}</span>
        </div>
        <p className="text-sm font-medium text-amber-950 leading-snug">
          {advisory.description || `${advisory.affected_road} has active conditions. Routes reflect current advisories.`}
        </p>
      </div>
    </div>
  );
}
