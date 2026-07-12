import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        console.error('CodeBuddy GUI render failed', error, info)
    }

    render() {
        if (!this.state.error) return this.props.children
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-[#111] px-6 text-white">
                <div className="max-w-xl">
                    <div className="text-lg font-semibold">CodeBuddy GUI 无法加载</div>
                    <div className="mt-2 text-sm text-gray-300">{this.state.error.message || String(this.state.error)}</div>
                    <button className="mt-4 rounded bg-blue-600 px-3 py-2 text-sm" onClick={() => window.location.reload()}>
                        重新加载
                    </button>
                </div>
            </div>
        )
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <AppErrorBoundary>
            <App />
        </AppErrorBoundary>
    </React.StrictMode>
)
