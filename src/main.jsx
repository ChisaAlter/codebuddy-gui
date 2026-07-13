import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { error: null, openingDiagnostics: false, actionError: '' }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        console.error('CodeBuddy GUI render failed', error, info)
        const reportRequest = window.electronAPI?.reportRendererError?.({
            message: error?.message || String(error),
            stack: error?.stack || '',
            componentStack: info?.componentStack || '',
            route: window.location.hash || '',
        })
        reportRequest?.catch((reportError) => console.error('Unable to persist renderer error', reportError))
    }

    openDiagnostics = async () => {
        if (this.state.openingDiagnostics) return
        this.setState({ openingDiagnostics: true, actionError: '' })
        try {
            if (!window.electronAPI?.openUserData) throw new Error('诊断目录接口不可用')
            await window.electronAPI.openUserData()
        } catch (error) {
            this.setState({ actionError: error?.message || '打开诊断目录失败' })
        } finally {
            this.setState({ openingDiagnostics: false })
        }
    }

    render() {
        if (!this.state.error) return this.props.children
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-[#111] px-6 text-white">
                <div className="w-full max-w-xl">
                    <div className="text-lg font-semibold">CodeBuddy GUI 无法加载</div>
                    <div className="mt-2 break-words text-sm text-gray-300">{this.state.error.message || String(this.state.error)}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            className="rounded bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500"
                            onClick={() => {
                                if (window.electronAPI?.windowReload) window.electronAPI.windowReload()
                                else window.location.reload()
                            }}
                        >
                            重新加载
                        </button>
                        <button className="rounded border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60" disabled={this.state.openingDiagnostics} onClick={this.openDiagnostics}>
                            {this.state.openingDiagnostics ? '正在打开...' : '打开诊断目录'}
                        </button>
                    </div>
                    <div className="mt-3 text-xs text-gray-400">错误已写入 crash.log，可在诊断目录中获取。</div>
                    {this.state.actionError ? <div className="mt-2 text-xs text-red-400">{this.state.actionError}</div> : null}
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
