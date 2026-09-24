import React from 'react';
import { X } from 'lucide-react';

export default function ConfirmDialog({ open, title, message, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 id="confirm-dialog-title" className="text-xl font-bold text-slate-900 pr-8">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="mt-3 text-sm leading-6 text-slate-600">
          {message}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
