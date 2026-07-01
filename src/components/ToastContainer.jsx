import React from 'react';
import { useStore } from '../store';

export default function ToastContainer() {
    const { toasts, removeToast } = useStore();

    React.useEffect(() => {
        if (toasts.length > 0) {
            const timer = setTimeout(() => removeToast(toasts[0].id), 3000);
            return () => clearTimeout(timer);
        }
    }, [toasts]);

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <div key={toast.id} className={`toast toast-${toast.type || 'info'}`}>
                    <span className="text-sm">{toast.message}</span>
                    <button onClick={() => removeToast(toast.id)} className="ml-auto" style={{ color: 'var(--color-text-muted)' }}>✕</button>
                </div>
            ))}
        </div>
    );
}
